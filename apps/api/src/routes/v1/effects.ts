import type { GetEffectsOptions } from '@tessera/knowledge-graph';
import type { ZodFastify } from '../../app-types.js';
import { requirePermission, tenantOf } from '../../auth/index.js';
import type { ApiServices } from '../../services.js';
import {
  assertEffectBodySchema,
  effectLinkSchema,
  effectsQuerySchema,
  effectsResponseSchema,
  type AssertEffectBody,
  type EffectsQuery,
} from '../../schemas/effects.js';

/**
 * `/v1/effects` — read ranked dependents of a node (`GET`, get_effects, F-008/FR-19) and manually assert
 * an effect-link (`POST`, FR-17/18). An unknown node surfaces the service's `NOT_FOUND` (404) via the
 * error envelope; asserted links are always `origin: manual`.
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
      config: { audit: 'effects.read' },
    },
    async (request) => {
      const { kind, key, maxDepth } = request.query;
      const options: GetEffectsOptions | undefined =
        maxDepth === undefined ? undefined : { maxDepth };
      // Data-plane isolation (FR-52): traverse only the caller-tenant's graph.
      const effects = await services.graph
        .forTenant(tenantOf(request))
        .getEffects({ kind, key }, options);
      return { effects };
    },
  );

  app.post<{ Body: AssertEffectBody }>(
    '/effects',
    {
      preHandler: requirePermission('effects:write'),
      schema: {
        tags: ['effects'],
        summary: 'Assert an effect-link: changing `from` may require reviewing `to`.',
        body: assertEffectBodySchema,
        response: { 201: effectLinkSchema },
      },
      config: { audit: 'effects.write' },
    },
    async (request, reply) => {
      const { from, to, rationale, confidence, metadata } = request.body;
      const edge = await services.graph.forTenant(tenantOf(request)).assertEffectLink({
        from,
        to,
        rationale,
        origin: 'manual', // clients may only assert manual links (static/learned are system-derived)
        ...(confidence !== undefined ? { confidence } : {}),
        ...(metadata !== undefined ? { metadata } : {}),
      });
      return reply.status(201).send(edge);
    },
  );
}
