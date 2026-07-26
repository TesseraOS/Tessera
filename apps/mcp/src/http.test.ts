import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createInMemoryTokenStore,
  createTokenAuthProvider,
  type ApiServices,
  type Role,
  type TokenStore,
} from '@tessera/api';
import { createContextCompiler } from '@tessera/context-compiler';
import { createInMemoryGraphStore, createKnowledgeGraphService } from '@tessera/knowledge-graph';
import { createInMemoryMemoryStore, createMemoryService } from '@tessera/memory';
import { createHybridRetriever } from '@tessera/retrieval';
import { createMcpGateway } from './gateway.js';
import { createMcpHttpHandler, type McpHttpHandler, type McpHttpHandlerOptions } from './http.js';

/**
 * Raw-HTTP coverage for the remote-MCP transport (F-055): the boundary 401, session binding, the
 * capacity cap, the idle sweep, and teardown. Deliberately **no MCP client** — every assertion here is
 * about HTTP status/headers/session bookkeeping, so a protocol-level client would only obscure it. The
 * real-client journey is `tests/e2e/http.e2e.test.ts`.
 *
 * The host is a bare `node:http` server with no body parser, which exercises the `parsedBody`-absent
 * path (the SDK reads the stream itself). The Fastify-mounted path is covered in `@tessera/server`.
 */

/** Minimal-but-real services: no tool is ever called here, but `buildMcpServer` needs the ports. */
function createServices(): ApiServices {
  const search = createHybridRetriever([]);
  const graphStore = createInMemoryGraphStore();
  return {
    search,
    graph: createKnowledgeGraphService(graphStore),
    memory: createMemoryService(createInMemoryMemoryStore()),
    compiler: createContextCompiler({
      retriever: search,
      fragmentSource: { get: () => Promise.resolve(undefined) },
      graphStore,
    }),
  };
}

const INITIALIZE_BODY = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'raw-test-client', version: '0.0.0' },
  },
});

const MCP_ACCEPT = 'application/json, text/event-stream';

describe('createMcpHttpHandler', () => {
  let server: Server;
  let handler: McpHttpHandler;
  let url: string;
  let tokenStore: TokenStore;
  let clock = 0;

  /** Issue a real token from the real F-034 store — no auth doubles anywhere in this file. */
  async function issue(
    principalId: string,
    roles: Role[] = ['member'],
    tenantId = 'acme',
  ): Promise<string> {
    const { token } = await tokenStore.issue({ tenantId, principalId, roles });
    return token;
  }

  async function start(options: Partial<McpHttpHandlerOptions> = {}): Promise<void> {
    tokenStore = createInMemoryTokenStore();
    handler = createMcpHttpHandler(createServices(), {
      gateway: createMcpGateway({ auth: createTokenAuthProvider({ tokenStore }) }),
      // The timer is off; `sweep()` is driven explicitly so the TTL assertions are deterministic.
      sweepIntervalMs: 0,
      now: () => clock,
      ...options,
    });
    server = createServer((req, res) => {
      void handler.handle(req, res);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
  }

  /** POST an MCP request; `token`/`session` are omitted when undefined. */
  function post(
    body: string,
    options: { token?: string; session?: string } = {},
  ): Promise<Response> {
    return fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: MCP_ACCEPT,
        ...(options.token !== undefined ? { authorization: `Bearer ${options.token}` } : {}),
        ...(options.session !== undefined ? { 'mcp-session-id': options.session } : {}),
      },
      body,
    });
  }

  /**
   * Open a real session and return its id. The initialize response is an SSE stream, so the body is
   * cancelled once the header we care about has been read.
   */
  async function openSession(token: string): Promise<string> {
    const response = await post(INITIALIZE_BODY, { token });
    expect(response.status).toBe(200);
    const sessionId = response.headers.get('mcp-session-id');
    await response.body?.cancel();
    expect(sessionId).toBeTruthy();
    return sessionId as string;
  }

  beforeEach(() => {
    clock = 0;
  });

  afterEach(async () => {
    await handler.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  describe('the boundary rejects before allocating anything (ADR-0058 §5)', () => {
    it('answers 401 with a Bearer challenge and a masked envelope when no credential is sent', async () => {
      await start();
      const response = await post(INITIALIZE_BODY);

      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toBe('Bearer error="invalid_token"');
      expect(await response.json()).toEqual({
        error: { code: 'UNAUTHORIZED', message: expect.any(String) },
      });
      // The point of a boundary check: no session, no McpServer, nothing to leak.
      expect(handler.sessionCount).toBe(0);
    });

    it('answers 401 for a garbage token', async () => {
      await start();
      const response = await post(INITIALIZE_BODY, { token: 'not-a-real-token' });

      expect(response.status).toBe(401);
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
        'UNAUTHORIZED',
      );
      expect(handler.sessionCount).toBe(0);
    });

    it('answers 401 for a revoked token — revocation takes effect on the next request', async () => {
      await start();
      const { token, record } = await tokenStore.issue({
        tenantId: 'acme',
        principalId: 'agent',
        roles: ['member'],
      });
      expect((await post(INITIALIZE_BODY, { token })).status).toBe(200);

      await tokenStore.revoke(record.id);
      expect((await post(INITIALIZE_BODY, { token })).status).toBe(401);
    });

    it('refuses a non-initialize request that carries no session id, registering no session', async () => {
      await start();
      const token = await issue('agent');
      const response = await post(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }), {
        token,
      });

      // The SDK refuses a non-initialize request that carries no session id, and no session is
      // registered for it. NOTE: this does NOT prove the speculative server was closed — `sessions`
      // is only ever written from `onsessioninitialized`, which never fires on this path, so
      // `sessionCount` is 0 either way. That close is not observable from outside the handler; the
      // assertion here is scoped to what it can actually see.
      expect(response.status).toBe(400);
      expect(handler.sessionCount).toBe(0);

      // What IS observable: capacity is not consumed by the refused attempt.
      await start({ maxSessions: 1 });
      const live = await issue('agent-2');
      await post(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }), { token: live });
      const opened = await openSession(live);
      expect(opened).toBeTruthy();
    });
  });

  describe('session lifecycle', () => {
    it('opens a session on initialize and counts it', async () => {
      await start();
      const sessionId = await openSession(await issue('agent'));

      expect(sessionId).toMatch(/[0-9a-f-]{36}/);
      expect(handler.sessionCount).toBe(1);
    });

    it('answers 404 for an unknown session id', async () => {
      await start();
      const response = await post(INITIALIZE_BODY, {
        token: await issue('agent'),
        session: 'e4f1c0de-0000-4000-8000-000000000000',
      });

      expect(response.status).toBe(404);
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe('NOT_FOUND');
    });

    it('answers 404 — not 403 — when another principal presents a valid token for the session', async () => {
      await start();
      const sessionId = await openSession(await issue('agent-a'));

      const response = await post(INITIALIZE_BODY, {
        token: await issue('agent-b'),
        session: sessionId,
      });

      // 404 so the response never confirms to a stranger that the session exists (ADR-0058 §4).
      expect(response.status).toBe(404);
      expect(handler.sessionCount).toBe(1); // agent-a's session is untouched
    });

    it('answers 404 when the SAME principal id in a DIFFERENT tenant presents the session id', async () => {
      // The case a principal-only binding misses, and the one ADR-0058 §4 actually exists for: the
      // token store's principal_id carries no cross-tenant uniqueness, so `ci-bot` is a perfectly
      // ordinary name for two different tenants' automation. Binding on the id alone let globex's
      // ci-bot attach to acme's session.
      await start();
      const sessionId = await openSession(await issue('ci-bot', ['member'], 'acme'));

      const response = await post(INITIALIZE_BODY, {
        token: await issue('ci-bot', ['member'], 'globex'),
        session: sessionId,
      });

      expect(response.status).toBe(404);
      expect(handler.sessionCount).toBe(1);
    });

    it('refuses a new session beyond maxSessions with a retryable 429', async () => {
      await start({ maxSessions: 1 });
      const token = await issue('agent');
      await openSession(token);

      const response = await post(INITIALIZE_BODY, { token });
      expect(response.status).toBe(429);
      expect(response.headers.get('retry-after')).toBe('5');
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
        'RATE_LIMITED',
      );
      expect(handler.sessionCount).toBe(1);
    });
  });

  describe('teardown', () => {
    it('closes a session on an explicit DELETE', async () => {
      await start();
      const token = await issue('agent');
      const sessionId = await openSession(token);

      const response = await fetch(url, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}`, 'mcp-session-id': sessionId },
      });

      expect(response.status).toBe(200);
      expect(handler.sessionCount).toBe(0);
    });

    it('sweeps a session that has gone idle past the TTL, and keeps a fresh one', async () => {
      await start({ sessionTtlMs: 1000 });
      const idle = await openSession(await issue('agent-a'));
      expect(idle).toBeTruthy();

      clock = 1001;
      const fresh = await openSession(await issue('agent-b'));
      expect(fresh).toBeTruthy();
      expect(handler.sessionCount).toBe(2);

      await handler.sweep();

      // Only the one whose last request is older than the TTL is gone. This is the leak that
      // `client.close()` would otherwise create: the client sends no DELETE, so nothing else reaps it.
      expect(handler.sessionCount).toBe(1);
    });

    it('close() also releases a session that was still in flight when it ran', async () => {
      // `close()` clears the map and stops the sweeper. A request that passed the `closed` check a
      // moment earlier still completes and initializes a session — which nothing would ever reap.
      // Slow authentication makes the window deterministic.
      tokenStore = createInMemoryTokenStore();
      const realAuth = createTokenAuthProvider({ tokenStore });
      handler = createMcpHttpHandler(createServices(), {
        gateway: createMcpGateway({
          auth: {
            authenticate: async (input) => {
              await new Promise((resolve) => setTimeout(resolve, 150));
              return realAuth.authenticate(input);
            },
          },
        }),
        sweepIntervalMs: 0,
      });
      server = createServer((req, res) => {
        void handler.handle(req, res);
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;

      const inFlight = post(INITIALIZE_BODY, { token: await issue('agent') });
      await new Promise((resolve) => setTimeout(resolve, 40)); // past the `closed` check, mid-auth
      await handler.close();

      const response = await inFlight;
      await response.body?.cancel();

      expect(handler.sessionCount).toBe(0);
    });

    it('close() drops every live session and refuses further requests', async () => {
      await start();
      await openSession(await issue('agent'));
      expect(handler.sessionCount).toBe(1);

      await handler.close();
      expect(handler.sessionCount).toBe(0);

      const response = await post(INITIALIZE_BODY, { token: await issue('agent-2') });
      expect(response.status).toBe(429);
      expect(handler.sessionCount).toBe(0);
    });
  });

  it('preserves headers the host set on the response (the F-044 hijack idiom)', async () => {
    // apps/server writes the security headers + x-request-id onto `reply.raw` before delegating,
    // because a hijacked reply loses anything set through Fastify. Node merges setHeader values into
    // the transport's own writeHead — this asserts that merge actually happens.
    tokenStore = createInMemoryTokenStore();
    handler = createMcpHttpHandler(createServices(), {
      gateway: createMcpGateway({ auth: createTokenAuthProvider({ tokenStore }) }),
      sweepIntervalMs: 0,
    });
    server = createServer((req, res) => {
      res.setHeader('x-request-id', 'req-42');
      void handler.handle(req, res);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;

    // On our own error path...
    const unauthorized = await post(INITIALIZE_BODY);
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get('x-request-id')).toBe('req-42');

    // ...and on a response the SDK transport writes.
    const initialized = await post(INITIALIZE_BODY, { token: await issue('agent') });
    expect(initialized.status).toBe(200);
    expect(initialized.headers.get('x-request-id')).toBe('req-42');
    await initialized.body?.cancel();
  });
});
