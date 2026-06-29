import { z } from 'zod/v4';
import type { ZodFastify } from '../app-types.js';
import type { ApiServices } from '../services.js';

const healthResponseSchema = z.object({ status: z.literal('ok') });

const readyCheckSchema = z.object({
  name: z.string(),
  ok: z.boolean(),
  detail: z.string().optional(),
});

const readyResponseSchema = z.object({
  status: z.enum(['ready', 'not_ready']),
  checks: z.array(readyCheckSchema),
});

/**
 * Operational endpoints (unversioned, NFR — observability): `/health` is liveness (always `ok`
 * while the process serves), `/ready` runs the injected readiness probe and answers `503` until
 * dependencies are reachable so an orchestrator can hold traffic.
 */
export function registerHealthRoutes(app: ZodFastify, services: ApiServices): void {
  app.get(
    '/health',
    {
      schema: {
        tags: ['ops'],
        description: 'Liveness probe.',
        response: { 200: healthResponseSchema },
      },
    },
    () => ({ status: 'ok' as const }),
  );

  app.get(
    '/ready',
    {
      schema: {
        tags: ['ops'],
        description: 'Readiness probe — 503 until dependencies are reachable.',
        response: { 200: readyResponseSchema, 503: readyResponseSchema },
      },
    },
    async (_request, reply) => {
      const report = services.readiness ? await services.readiness() : { ready: true, checks: [] };
      return reply
        .status(report.ready ? 200 : 503)
        .send({ status: report.ready ? 'ready' : 'not_ready', checks: [...report.checks] });
    },
  );
}
