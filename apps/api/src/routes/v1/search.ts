import type { RetrievalQuery } from '@tessera/retrieval';
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
      const { query, limit } = request.body;
      const retrievalQuery: RetrievalQuery =
        limit === undefined ? { text: query } : { text: query, limit };
      // Data-plane isolation (FR-52): search only the caller-tenant's indices.
      const results = await services.search.forTenant(tenantOf(request)).search(retrievalQuery);
      return { results };
    },
  );
}
