import type { GetEffectsOptions } from '@tessera/knowledge-graph';
import type { ZodFastify } from '../../app-types.js';
import { requirePermission } from '../../auth/index.js';
import type { ApiServices } from '../../services.js';
import {
  effectsQuerySchema,
  effectsResponseSchema,
  type EffectsQuery,
} from '../../schemas/effects.js';

/**
 * `GET /v1/effects?kind&key&maxDepth` — ranked dependents of a node with their paths (get_effects,
 * F-008/FR-19). An unknown node surfaces the service's `NOT_FOUND` (404) via the error envelope.
 */
export function registerEffectsRoutes(app: ZodFastify, services: ApiServices): void {
  app.get<{ Querystring: EffectsQuery }>(
    '/effects',
    {
      preHandler: requirePermission('effects:read'),
      schema: {
        tags: ['effects'],
        summary: 'What is affected if a node changes (ranked, path-bearing).',
        querystring: effectsQuerySchema,
        response: { 200: effectsResponseSchema },
      },
    },
    async (request) => {
      const { kind, key, maxDepth } = request.query;
      const options: GetEffectsOptions | undefined =
        maxDepth === undefined ? undefined : { maxDepth };
      const effects = await services.graph.getEffects({ kind, key }, options);
      return { effects };
    },
  );
}
