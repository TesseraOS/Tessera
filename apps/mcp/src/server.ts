import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiServices, AuthContext } from '@tessera/api';
import { DEFAULT_TENANT_ID } from '@tessera/core';
import type { CompileRequest } from '@tessera/context-compiler';
import type { GetEffectsOptions } from '@tessera/knowledge-graph';
import type { RetrievalQuery } from '@tessera/retrieval';
import { buildExplanation } from './explain.js';
import type { McpCallContext, McpGateway, McpToolName } from './gateway.js';
import { runTool } from './result.js';
import {
  captureMemoryShape,
  compileShape,
  effectsShape,
  explainShape,
  searchShape,
} from './schemas.js';

/** Identifies this server in the MCP handshake. */
export const SERVER_INFO = { name: 'tessera', version: '0.0.0' } as const;

export interface BuildMcpServerOptions {
  /**
   * The auth/quota gateway (F-026; FR-36). When set, every tool call is authenticated + authorized +
   * metered before the service runs. When omitted, tools are unguarded — the surface behaves exactly
   * as before (the composition root injects a gateway for multi-client/hosted deployments).
   */
  readonly gateway?: McpGateway;
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
  const { gateway } = options;

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

  return server;
}
