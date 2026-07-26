import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { ApiServices } from '@tessera/api';
import { NotFoundError, RateLimitedError } from '@tessera/core';
import type { McpCallContext, McpGateway } from './gateway.js';
import { toEnvelope } from './result.js';
import { buildMcpServer, type BuildMcpServerOptions } from './server.js';

/**
 * Remote MCP over the SDK's **streamable-HTTP** transport (F-055; FR-71, ADR-0058) — the multi-client
 * transport the F-026 gateway was designed for and never had. stdio ([`./stdio.ts`]) remains the local
 * default; this is what a remote agent connects to.
 *
 * Deliberately **Fastify-free** (the F-012 invariant): it speaks raw `node:http`, so the host — a bare
 * `http.createServer`, or the composition root mounting it beside REST — decides the framework. That is
 * also why it lives on the `@tessera/mcp/http` subpath rather than the package root: importing the SDK's
 * streamable transport pulls `hono`/`@hono/node-server` into the module graph, and the `tessera-mcp`
 * stdio binary that agent clients spawn must not pay for them.
 *
 * Every request is authenticated at the boundary before any state is allocated, and every *tool call*
 * still goes through {@link McpGateway.guard} — so RBAC, quotas, and the audit trail are unchanged and
 * remote MCP never bypasses the gateway.
 */

/** Node's `IncomingMessage` plus the `auth` property the SDK reads to populate `authInfo`. */
type McpIncomingMessage = IncomingMessage & { auth?: AuthInfo };

/** One live MCP session: its server, its transport, and the identity that opened it. */
interface SessionEntry {
  readonly server: ReturnType<typeof buildMcpServer>;
  readonly transport: StreamableHTTPServerTransport;
  /** The principal that opened the session — a different one is refused (ADR-0058 §4). */
  readonly principalId: string;
  /** Epoch ms of the last request on this session; drives the idle sweep. */
  lastSeenAt: number;
}

export interface McpHttpHandlerOptions extends BuildMcpServerOptions {
  /**
   * **Required.** The gateway authenticates the connection (boundary) and every tool call. Required at
   * the type level, not optional-with-a-default, because an unauthenticated *remote* MCP surface is the
   * failure this feature must make unrepresentable (NFR-2). The config gate that refuses
   * `auth.mode: none` is the second, independent guard.
   */
  readonly gateway: McpGateway;
  /** Idle sessions are closed after this long without a request. Default 5 minutes. */
  readonly sessionTtlMs?: number;
  /** Hard cap on concurrent sessions; beyond it `initialize` is refused 503. Default 100. */
  readonly maxSessions?: number;
  /**
   * How often the idle sweep runs. Default 30s. The timer is `unref`'d, so it never holds the process
   * open. Set `0` to disable the timer entirely and drive {@link McpHttpHandler.sweep} yourself.
   */
  readonly sweepIntervalMs?: number;
  /** Clock, injectable for tests. Default `Date.now`. */
  readonly now?: () => number;
}

export interface McpHttpHandler {
  /**
   * Serve one MCP HTTP request (POST / GET / DELETE).
   *
   * `parsedBody` **must** be supplied when the host framework has already consumed the request stream
   * (Fastify parses `application/json` before the handler runs). Omitting it there makes the SDK call
   * `req.json()` on a drained stream and the request hangs.
   */
  handle(req: McpIncomingMessage, res: ServerResponse, parsedBody?: unknown): Promise<void>;
  /** Live session count — the leak detector these tests and the ops surface care about. */
  readonly sessionCount: number;
  /** Close every session idle beyond the TTL. Runs on a timer; exposed for deterministic tests. */
  sweep(): Promise<void>;
  /** Close every live session and stop the sweep timer. */
  close(): Promise<void>;
}

const DEFAULT_SESSION_TTL_MS = 300_000;
const DEFAULT_MAX_SESSIONS = 100;
const DEFAULT_SWEEP_INTERVAL_MS = 30_000;

/** The header carrying the session id, per the streamable-HTTP spec. */
const SESSION_HEADER = 'mcp-session-id';

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Write a masked error response. Uses the SAME {@link toEnvelope} policy as tool errors, so an internal
 * fault looks identical whether it leaves through a tool result or a status line. Headers already set
 * by the host (F-044 security headers, `x-request-id`) survive: Node merges `setHeader` values into
 * `writeHead`.
 *
 * `status` is passed per call site rather than derived from a table: REST's `statusForCode` lives
 * behind the Fastify-pulling `@tessera/api` root, and copying it here would be a second mapping to keep
 * in sync. Instead each call site throws the domain error whose code REST already maps to that status
 * (UNAUTHORIZED→401, NOT_FOUND→404, RATE_LIMITED→429), so the two surfaces agree by construction.
 */
function respondError(
  res: ServerResponse,
  status: number,
  error: unknown,
  headers: Readonly<Record<string, string>> = {},
): void {
  const envelope = toEnvelope(error);
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify({ error: envelope }));
}

/**
 * Build a remote-MCP HTTP handler over the given services.
 *
 * Sessions are **stateful** (ADR-0058 §2): the SDK's `Protocol.connect` throws when a second transport
 * is attached, so stateless mode would mean constructing a fresh `McpServer` — twenty tool
 * registrations plus Zod→JSON-Schema conversion — on every single request.
 */
export function createMcpHttpHandler(
  services: ApiServices,
  options: McpHttpHandlerOptions,
): McpHttpHandler {
  const {
    gateway,
    sessionTtlMs = DEFAULT_SESSION_TTL_MS,
    maxSessions = DEFAULT_MAX_SESSIONS,
    sweepIntervalMs = DEFAULT_SWEEP_INTERVAL_MS,
    now = Date.now,
    ...serverOptions
  } = options;

  const sessions = new Map<string, SessionEntry>();
  let closed = false;

  /** Options every session's server is built with — the gateway included, so tools stay guarded. */
  const buildOptions: BuildMcpServerOptions = { ...serverOptions, gateway };

  const closeEntry = async (sessionId: string, entry: SessionEntry): Promise<void> => {
    sessions.delete(sessionId);
    // Closing the server closes its transport (Protocol.close), which is the whole teardown.
    await entry.server.close();
  };

  const sweep = async (): Promise<void> => {
    const deadline = now() - sessionTtlMs;
    const expired = [...sessions].filter(([, entry]) => entry.lastSeenAt <= deadline);
    await Promise.all(expired.map(([sessionId, entry]) => closeEntry(sessionId, entry)));
  };

  // `unref` is mandatory: a ref'd interval keeps the Node process alive forever after the server stops.
  const timer =
    sweepIntervalMs > 0
      ? setInterval(() => {
          void sweep();
        }, sweepIntervalMs)
      : undefined;
  timer?.unref();

  /**
   * Open a session for an `initialize` request. The SDK decides whether the body actually *is* one: if
   * it is not, it answers 400 and never generates a session id, so nothing was registered and we close
   * the speculative server before returning.
   */
  const openSession = async (
    req: McpIncomingMessage,
    res: ServerResponse,
    parsedBody: unknown,
    principalId: string,
  ): Promise<void> => {
    if (sessions.size >= maxSessions) {
      respondError(res, 429, new RateLimitedError('too many concurrent MCP sessions'), {
        'retry-after': '5',
      });
      return;
    }

    const server = buildMcpServer(services, buildOptions);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        sessions.set(sessionId, { server, transport, principalId, lastSeenAt: now() });
      },
      // Fired by the SDK on an explicit DELETE.
      onsessionclosed: (sessionId) => {
        sessions.delete(sessionId);
      },
    });
    // MUST be assigned before `connect`: Protocol.connect captures and chains the existing handler, so
    // assigning afterwards clobbers the SDK's own cleanup and leaks the session.
    transport.onclose = () => {
      const sessionId = transport.sessionId;
      if (sessionId !== undefined) sessions.delete(sessionId);
    };

    // The assertion is an SDK *declaration* artifact, not a real incompatibility: the class exposes
    // `onclose` as an accessor pair typed `(() => void) | undefined`, while its own `Transport`
    // interface declares `onclose?: () => void` — and under `exactOptionalPropertyTypes` those differ.
    // The runtime object satisfies `Transport` exactly. Asserting here is narrower than loosening the
    // workspace flag or widening our own types (the zod-exactoptional-bridge lesson).
    await server.connect(transport as Transport);
    await transport.handleRequest(req, res, parsedBody);

    if (transport.sessionId === undefined) {
      // Not an initialize request — the SDK already answered 400. Nothing was registered; drop it.
      await server.close();
    }
  };

  return {
    get sessionCount() {
      return sessions.size;
    },

    sweep,

    async handle(req, res, parsedBody) {
      if (closed) {
        // Retryable, not a fault: the host is shutting down. Guarding here is what stops a request
        // racing `close()` from allocating a session nothing will ever tear down.
        respondError(res, 429, new RateLimitedError('server is shutting down'), {
          'retry-after': '5',
        });
        return;
      }

      // 1. Boundary auth (ADR-0058 §5) — before any session or McpServer exists. `headers` is Node's
      //    lowercase-keyed record, exactly what defaultCredentialResolver indexes into.
      const context: McpCallContext = { requestInfo: { headers: req.headers } };
      let principalId: string;
      try {
        principalId = (await gateway.authenticate(context)).principal.id;
      } catch (error) {
        // 401 + the challenge every MCP client expects at the HTTP layer. Nothing was allocated.
        respondError(res, 401, error, { 'www-authenticate': 'Bearer error="invalid_token"' });
        return;
      }

      // 2. Hand the SDK the credential through its own documented channel as well as the raw header
      //    (ADR-0058 §6). `scopes` stays empty on purpose: Tessera permissions are not OAuth scopes,
      //    and publishing them here would invite an SDK-side check that is not the authority — the
      //    gateway is.
      const authorization = firstHeader(req.headers.authorization) ?? '';
      if (/^Bearer /i.test(authorization)) {
        req.auth = {
          token: authorization.slice('Bearer '.length),
          clientId: principalId,
          scopes: [],
        };
      }

      const sessionId = firstHeader(req.headers[SESSION_HEADER]);
      if (sessionId === undefined || sessionId === '') {
        await openSession(req, res, parsedBody, principalId);
        return;
      }

      const entry = sessions.get(sessionId);
      // A session belonging to another principal answers 404, NOT 403: the SDK's own code for an
      // unknown session, so the response never confirms to a stranger that the session exists.
      if (entry === undefined || entry.principalId !== principalId) {
        respondError(res, 404, new NotFoundError('session not found'));
        return;
      }

      entry.lastSeenAt = now();
      await entry.transport.handleRequest(req, res, parsedBody);
    },

    async close() {
      closed = true;
      if (timer !== undefined) clearInterval(timer);
      const live = [...sessions];
      sessions.clear();
      await Promise.all(live.map(([, entry]) => entry.server.close()));
    },
  };
}
