import {
  EDGE_KINDS,
  NODE_KINDS,
  type EdgeKind,
  type GraphQuery,
  type NodeKind,
} from '@tessera/knowledge-graph';
import type { ZodFastify } from '../../app-types.js';
import { requirePermission, tenantOf } from '../../auth/index.js';
import { projectOf } from '../../projects/selection.js';
import type { ApiServices } from '../../services.js';
import {
  graphQuerySchema,
  graphResponseSchema,
  type GraphQueryString,
} from '../../schemas/graph.js';

/** Parse a comma-separated kind list, keeping only valid kinds (unknown values are ignored). */
function parseKinds<T extends string>(
  csv: string | undefined,
  valid: readonly T[],
): T[] | undefined {
  if (csv === undefined) return undefined;
  const allowed = new Set<string>(valid);
  const kinds = csv
    .split(',')
    .map((value) => value.trim())
    .filter((value) => allowed.has(value)) as T[];
  return kinds.length > 0 ? kinds : undefined;
}

/**
 * `GET /v1/graph` — a bounded, read-only subgraph of the knowledge graph for visualization (FR-42).
 * Tenant-scoped via `forTenant` (ADR-0033); `effects:read` (same as get_effects), audited. Level-of-
 * detail: `limit` caps the node set and edges are confined to the returned nodes (a coherent subgraph).
 */
export function registerGraphRoutes(app: ZodFastify, services: ApiServices): void {
  app.get<{ Querystring: GraphQueryString }>(
    '/graph',
    {
      preHandler: requirePermission('effects:read'),
      schema: {
        tags: ['graph'],
        summary: 'A bounded subgraph of the knowledge graph for visualization.',
        querystring: graphQuerySchema,
        response: { 200: graphResponseSchema },
      },
      config: { audit: 'effects.read' },
    },
    async (request) => {
      const { limit, nodeKinds, edgeKinds } = request.query;
      const nodeFilter = parseKinds<NodeKind>(nodeKinds, NODE_KINDS);
      const edgeFilter = parseKinds<EdgeKind>(edgeKinds, EDGE_KINDS);
      const filter: GraphQuery = {
        ...(limit !== undefined ? { limit } : {}),
        ...(nodeFilter !== undefined ? { nodeKinds: nodeFilter } : {}),
        ...(edgeFilter !== undefined ? { edgeKinds: edgeFilter } : {}),
      };
      const snapshot = await services.graph
        .forTenant(tenantOf(request))
        .forProject(projectOf(request))
        .queryGraph(filter);
      return { nodes: [...snapshot.nodes], edges: [...snapshot.edges] };
    },
  );
}
