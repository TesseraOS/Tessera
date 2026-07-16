// `toRetrievalInclude` bridges Zod's `| undefined` optionals onto the exact-optional domain type
// (the zod-exactoptional-bridge lesson). It lives in @tessera/retrieval so this route and the MCP
// `search` tool share one mapper and cannot drift on which flags they honour (ADR-0036).
import { toRetrievalInclude, type RetrievalQuery } from '@tessera/retrieval';
import type { ZodFastify } from '../../app-types.js';
import { requirePermission, tenantOf } from '../../auth/index.js';
import type { ApiServices } from '../../services.js';
import { searchBodySchema, searchResponseSchema, type SearchBody } from '../../schemas/search.js';

/** `POST /v1/search` — run hybrid retrieval and return one fused, ranked candidate set (F-009). */
export function registerSearchRoutes(app: ZodFastify, services: ApiServices): void {
  app.post<{ Body: SearchBody }>(
    '/search',
    {
      preHandler: requirePermission('search:read'),
      schema: {
        tags: ['search'],
        summary: 'Hybrid search across code, memory, and the knowledge graph.',
        body: searchBodySchema,
        response: { 200: searchResponseSchema },
      },
      config: { audit: 'search' },
    },
    async (request) => {
      const { query, limit, include } = request.body;
      const retrievalQuery: RetrievalQuery = {
        text: query,
        ...(limit === undefined ? {} : { limit }),
        // Threaded through only when asked for: the default answer stays token-lean (NFR-4).
        ...(include === undefined ? {} : { include: toRetrievalInclude(include) }),
      };
      // Data-plane isolation (FR-52): search only the caller-tenant's indices.
      const results = await services.search.forTenant(tenantOf(request)).search(retrievalQuery);
      return { results };
    },
  );
}
