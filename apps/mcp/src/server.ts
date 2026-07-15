import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiServices, AuthContext } from '@tessera/api';
// Value imports from the Fastify-free `@tessera/api/auth` subpath (the F-012 invariant).
import {
  isExpired,
  isRevoked,
  permissionsForRoles,
  type ApiTokenRecord,
  type Permission,
  type TokenStore,
} from '@tessera/api/auth';
import {
  ConflictError,
  DEFAULT_TENANT_ID,
  ForbiddenError,
  InternalError,
  NotFoundError,
} from '@tessera/core';
import type { CompileRequest } from '@tessera/context-compiler';
import type { GetEffectsOptions } from '@tessera/knowledge-graph';
import type { RetrievalQuery } from '@tessera/retrieval';
import { buildExplanation } from './explain.js';
import type { McpCallContext, McpGateway, McpToolName } from './gateway.js';
import { runTool } from './result.js';
import {
  addSourceShape,
  assertEffectShape,
  captureMemoryShape,
  compileShape,
  effectsShape,
  explainShape,
  issueTokenShape,
  listSourcesShape,
  listTokensShape,
  queryGraphShape,
  revokeTokenShape,
  scanSourceShape,
  searchShape,
} from './schemas.js';

/** Project a stored token record to the wire — never the secret; `active` derived (mirrors REST). */
function toWireToken(
  record: ApiTokenRecord,
  at: Date,
): {
  id: string;
  principalId: string;
  displayName?: string;
  roles: readonly string[];
  scopes?: readonly string[];
  createdAt: string;
  revokedAt: string | null;
  expiresAt: string | null;
  active: boolean;
} {
  return {
    id: record.id,
    principalId: record.principalId,
    ...(record.displayName !== undefined ? { displayName: record.displayName } : {}),
    roles: [...record.roles],
    ...(record.scopes !== undefined ? { scopes: [...record.scopes] } : {}),
    createdAt: record.createdAt,
    revokedAt: record.revokedAt ?? null,
    expiresAt: record.expiresAt ?? null,
    active: !isRevoked(record) && !isExpired(record, at),
  };
}

/** A registered source projected to the wire shape (tenancy stays off the wire — ADR-0033). */
type SourceService = NonNullable<ApiServices['sources']>;
type SourceRecord = Awaited<ReturnType<SourceService['register']>>;

/** The source service, or a clean error when the runtime wired none. */
function requireSources(services: ApiServices): SourceService {
  if (services.sources === undefined) {
    throw new InternalError('source management is not configured for this deployment');
  }
  return services.sources;
}

/** Drop `tenantId` from a stored source (kept off the wire, mirroring the REST surface). */
function toWireSource(record: SourceRecord): {
  id: string;
  kind: string;
  label: string;
  config: Record<string, unknown>;
  createdAt: string;
} {
  return {
    id: record.id,
    kind: record.kind,
    label: record.label,
    config: { ...record.config },
    createdAt: record.createdAt,
  };
}

/** Identifies this server in the MCP handshake. */
export const SERVER_INFO = { name: 'tessera', version: '0.0.0' } as const;

export interface BuildMcpServerOptions {
  /**
   * The auth/quota gateway (F-026; FR-36). When set, every tool call is authenticated + authorized +
   * metered before the service runs. When omitted, tools are unguarded — the surface behaves exactly
   * as before (the composition root injects a gateway for multi-client/hosted deployments).
   */
  readonly gateway?: McpGateway;
  /**
   * The token store backing the token-management tools (F-046; ADR-0036 parity with `/v1/tokens`).
   * The composition root passes `runtime.auth.tokenStore` (present in `token` mode); without one the
   * token tools answer a clean error. See {@link TokenStore}.
   */
  readonly tokenStore?: TokenStore;
}

/** Token budget used by `explain` when the caller does not specify one. */
const DEFAULT_EXPLAIN_BUDGET = 2000;

function toCompileRequest(args: {
  task: string;
  budget: number;
  // Widened to `| undefined` to bridge the SDK's exactOptional-incompatible inferred args.
  retrievalLimit?: number | undefined;
  filters?: { kinds?: string[] | undefined } | undefined;
}): CompileRequest {
  return {
    task: args.task,
    budget: args.budget,
    ...(args.retrievalLimit !== undefined ? { retrievalLimit: args.retrievalLimit } : {}),
    ...(args.filters !== undefined
      ? { filters: args.filters.kinds !== undefined ? { kinds: args.filters.kinds } : {} }
      : {}),
  };
}

/**
 * Build the Tessera MCP server over the injected {@link ApiServices} — the **same** domain services
 * the REST API wraps (F-011), so the two surfaces never diverge (FR-35). Tools: `search`,
 * `compile_context`, `get_effects`, `capture_memory`, `explain`. Inputs are validated by the SDK
 * against the Zod shapes; failures map through the shared error envelope. When a {@link McpGateway} is
 * supplied (F-026), every call is authenticated + authorized + quota-metered first; without one the
 * tools are unguarded (unchanged behavior). Real adapter wiring + the stdio process are the deployment
 * profile's job (F-015); this is a pure factory.
 */
export function buildMcpServer(
  services: ApiServices,
  options: BuildMcpServerOptions = {},
): McpServer {
  const server = new McpServer(SERVER_INFO);
  const { gateway, tokenStore } = options;

  /** The token store, or a clean error when the deployment wired none (mirrors the REST 409). */
  const requireTokenStore = (): TokenStore => {
    if (tokenStore === undefined) {
      throw new ConflictError('token management requires token auth mode (no token store)');
    }
    return tokenStore;
  };

  /**
   * Authenticate/authorize/meter a call when a gateway is configured; a no-op otherwise (back-compat).
   * Returns the resolved {@link AuthContext} (whose `tenantId` scopes the data plane, FR-52) — or
   * `undefined` when ungated, in which case the default tenant is used.
   */
  const guard = (tool: McpToolName, extra: McpCallContext): Promise<AuthContext | undefined> =>
    gateway === undefined ? Promise.resolve(undefined) : gateway.guard(tool, extra);

  /** The tenant a call runs in — the gateway's resolved tenant, or the default when ungated. */
  const tenantOf = (ctx: AuthContext | undefined): string => ctx?.tenantId ?? DEFAULT_TENANT_ID;

  server.registerTool(
    'search',
    {
      description: 'Hybrid search across code, memory, and the knowledge graph; one ranked set.',
      inputSchema: searchShape,
    },
    (args, extra) =>
      runTool(async () => {
        const ctx = await guard('search', extra);
        const query: RetrievalQuery =
          args.limit === undefined ? { text: args.query } : { text: args.query, limit: args.limit };
        return { results: await services.search.forTenant(tenantOf(ctx)).search(query) };
      }),
  );

  server.registerTool(
    'compile_context',
    {
      description: 'Compile a provenance-tagged, token-budget-bounded Context Package for a task.',
      inputSchema: compileShape,
    },
    (args, extra) =>
      runTool(async () => {
        const ctx = await guard('compile_context', extra);
        return services.compiler.forTenant(tenantOf(ctx)).compile(toCompileRequest(args));
      }),
  );

  server.registerTool(
    'get_effects',
    {
      description: 'What is affected if a node changes — ranked dependents with their paths.',
      inputSchema: effectsShape,
    },
    (args, extra) =>
      runTool(async () => {
        const ctx = await guard('get_effects', extra);
        const opts: GetEffectsOptions | undefined =
          args.maxDepth === undefined ? undefined : { maxDepth: args.maxDepth };
        return {
          effects: await services.graph
            .forTenant(tenantOf(ctx))
            .getEffects({ kind: args.kind, key: args.key }, opts),
        };
      }),
  );

  server.registerTool(
    'query_graph',
    {
      description: 'A bounded subgraph of the knowledge graph (nodes + edges) for exploration.',
      inputSchema: queryGraphShape,
    },
    (args, extra) =>
      runTool(async () => {
        const ctx = await guard('query_graph', extra);
        return services.graph.forTenant(tenantOf(ctx)).queryGraph({
          ...(args.nodeKinds !== undefined ? { nodeKinds: args.nodeKinds } : {}),
          ...(args.edgeKinds !== undefined ? { edgeKinds: args.edgeKinds } : {}),
          ...(args.limit !== undefined ? { limit: args.limit } : {}),
        });
      }),
  );

  server.registerTool(
    'assert_effect',
    {
      description:
        'Assert an effect-link: changing `from` may require reviewing `to` (rationale-backed).',
      inputSchema: assertEffectShape,
    },
    (args, extra) =>
      runTool(async () => {
        const ctx = await guard('assert_effect', extra);
        return services.graph.forTenant(tenantOf(ctx)).assertEffectLink({
          from: args.from,
          to: args.to,
          rationale: args.rationale,
          origin: 'manual',
          ...(args.confidence !== undefined ? { confidence: args.confidence } : {}),
        });
      }),
  );

  server.registerTool(
    'capture_memory',
    {
      description: 'Capture a new memory (decision/lesson/incident/…); returns the stored version.',
      inputSchema: captureMemoryShape,
    },
    (args, extra) =>
      runTool(async () => {
        const ctx = await guard('capture_memory', extra);
        return services.memory.forTenant(tenantOf(ctx)).capture(args);
      }),
  );

  server.registerTool(
    'add_source',
    {
      description: 'Register a filesystem or git source for ingestion; returns the stored source.',
      inputSchema: addSourceShape,
    },
    (args, extra) =>
      runTool(async () => {
        const ctx = await guard('add_source', extra);
        const record = await requireSources(services)
          .forTenant(tenantOf(ctx))
          .register({
            kind: args.kind,
            config: { root: args.root },
            ...(args.label !== undefined ? { label: args.label } : {}),
          });
        return toWireSource(record);
      }),
  );

  server.registerTool(
    'list_sources',
    {
      description: 'List the registered ingestion sources.',
      inputSchema: listSourcesShape,
    },
    (_args, extra) =>
      runTool(async () => {
        const ctx = await guard('list_sources', extra);
        const sources = await requireSources(services).forTenant(tenantOf(ctx)).list();
        return { sources: sources.map(toWireSource) };
      }),
  );

  server.registerTool(
    'scan_source',
    {
      description: 'Scan a source (incremental + idempotent); returns what changed.',
      inputSchema: scanSourceShape,
    },
    (args, extra) =>
      runTool(async () => {
        const ctx = await guard('scan_source', extra);
        const scoped = requireSources(services).forTenant(tenantOf(ctx));
        const { source, summary } = await scoped.scan(args.id as Parameters<typeof scoped.scan>[0]);
        return { source: toWireSource(source), summary };
      }),
  );

  server.registerTool(
    'explain',
    {
      description: 'Explain context selection for a task: per-fragment "why included" + the trace.',
      inputSchema: explainShape,
    },
    (args, extra) =>
      runTool(async () => {
        const ctx = await guard('explain', extra);
        const request = toCompileRequest({
          ...args,
          budget: args.budget ?? DEFAULT_EXPLAIN_BUDGET,
        });
        return buildExplanation(await services.compiler.forTenant(tenantOf(ctx)).compile(request));
      }),
  );

  // --- API-token self-service (F-046; ADR-0036 parity with REST /v1/tokens) ---

  server.registerTool(
    'list_tokens',
    {
      description: "List the calling tenant's API tokens (no secrets).",
      inputSchema: listTokensShape,
    },
    (_args, extra) =>
      runTool(async () => {
        const ctx = await guard('list_tokens', extra);
        const now = new Date();
        const records = await requireTokenStore().list(tenantOf(ctx));
        return { tokens: records.map((record) => toWireToken(record, now)) };
      }),
  );

  server.registerTool(
    'issue_token',
    {
      description: 'Issue a scoped API token; the plaintext secret is returned once.',
      inputSchema: issueTokenShape,
    },
    (args, extra) =>
      runTool(async () => {
        const ctx = await guard('issue_token', extra);
        // Least privilege: the new token must not exceed the caller (when gated).
        if (ctx !== undefined) {
          const fromRoles = permissionsForRoles(args.roles);
          const scoped = args.scopes === undefined ? undefined : new Set<Permission>(args.scopes);
          for (const permission of fromRoles) {
            if (scoped !== undefined && !scoped.has(permission)) continue;
            if (!ctx.permissions.has(permission)) {
              throw new ForbiddenError('cannot issue a token exceeding your own permissions');
            }
          }
        }
        const { token, record } = await requireTokenStore().issue({
          tenantId: tenantOf(ctx),
          principalId: args.principalId,
          roles: args.roles,
          ...(args.displayName !== undefined ? { displayName: args.displayName } : {}),
          ...(args.scopes !== undefined ? { scopes: args.scopes } : {}),
          ...(args.expiresAt !== undefined ? { expiresAt: args.expiresAt } : {}),
        });
        return { token: toWireToken(record, new Date()), secret: token };
      }),
  );

  server.registerTool(
    'revoke_token',
    {
      description: 'Revoke an API token by id.',
      inputSchema: revokeTokenShape,
    },
    (args, extra) =>
      runTool(async () => {
        const ctx = await guard('revoke_token', extra);
        const store = requireTokenStore();
        const owned = (await store.list(tenantOf(ctx))).some((record) => record.id === args.id);
        if (!owned) {
          throw new NotFoundError(`token not found: ${args.id}`);
        }
        await store.revoke(args.id);
        return { id: args.id, revoked: true };
      }),
  );

  return server;
}
