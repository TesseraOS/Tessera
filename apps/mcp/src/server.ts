import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiServices } from '@tessera/api';
import type { CompileRequest } from '@tessera/context-compiler';
import type { GetEffectsOptions } from '@tessera/knowledge-graph';
import type { RetrievalQuery } from '@tessera/retrieval';
import { buildExplanation } from './explain.js';
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
 * against the Zod shapes; failures map through the shared error envelope. Real adapter wiring + the
 * stdio process are the deployment profile's job (F-015); this is a pure factory.
 */
export function buildMcpServer(services: ApiServices): McpServer {
  const server = new McpServer(SERVER_INFO);

  server.registerTool(
    'search',
    {
      description: 'Hybrid search across code, memory, and the knowledge graph; one ranked set.',
      inputSchema: searchShape,
    },
    (args) =>
      runTool(async () => {
        const query: RetrievalQuery =
          args.limit === undefined ? { text: args.query } : { text: args.query, limit: args.limit };
        return { results: await services.search.search(query) };
      }),
  );

  server.registerTool(
    'compile_context',
    {
      description: 'Compile a provenance-tagged, token-budget-bounded Context Package for a task.',
      inputSchema: compileShape,
    },
    (args) => runTool(() => services.compiler.compile(toCompileRequest(args))),
  );

  server.registerTool(
    'get_effects',
    {
      description: 'What is affected if a node changes — ranked dependents with their paths.',
      inputSchema: effectsShape,
    },
    (args) =>
      runTool(async () => {
        const options: GetEffectsOptions | undefined =
          args.maxDepth === undefined ? undefined : { maxDepth: args.maxDepth };
        return {
          effects: await services.graph.getEffects({ kind: args.kind, key: args.key }, options),
        };
      }),
  );

  server.registerTool(
    'capture_memory',
    {
      description: 'Capture a new memory (decision/lesson/incident/…); returns the stored version.',
      inputSchema: captureMemoryShape,
    },
    (args) => runTool(() => services.memory.capture(args)),
  );

  server.registerTool(
    'explain',
    {
      description: 'Explain context selection for a task: per-fragment "why included" + the trace.',
      inputSchema: explainShape,
    },
    (args) =>
      runTool(async () => {
        const request = toCompileRequest({
          ...args,
          budget: args.budget ?? DEFAULT_EXPLAIN_BUDGET,
        });
        return buildExplanation(await services.compiler.compile(request));
      }),
  );

  return server;
}
