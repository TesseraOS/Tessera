import type { RetrievalQuery } from '@tessera/retrieval';
import type { ZodFastify } from '../../app-types.js';
import type { ApiServices } from '../../services.js';
import { searchBodySchema, searchResponseSchema, type SearchBody } from '../../schemas/search.js';

/** `POST /v1/search` — run hybrid retrieval and return one fused, ranked candidate set (F-009). */
export function registerSearchRoutes(app: ZodFastify, services: ApiServices): void {
  app.post<{ Body: SearchBody }>(
    '/search',
    {
      schema: {
        tags: ['search'],
        summary: 'Hybrid search across code, memory, and the knowledge graph.',
        body: searchBodySchema,
        response: { 200: searchResponseSchema },
      },
    },
    async (request) => {
      const { query, limit } = request.body;
      const retrievalQuery: RetrievalQuery =
        limit === undefined ? { text: query } : { text: query, limit };
      const results = await services.search.search(retrievalQuery);
      return { results };
    },
  );
}
