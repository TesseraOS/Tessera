import type { ZodFastify } from '../../app-types.js';
import { requirePermission, tenantOf } from '../../auth/index.js';
import { statsResponseSchema } from '../../schemas/stats.js';
import type { ApiServices } from '../../services.js';
import { computeWorkspaceStats } from '../../stats/core.js';

/**
 * `GET /v1/stats` — the workspace summary (F-060; FR-38/FR-62): how much this tenant actually has
 * indexed, remembered, and connected. Backs the dashboard Overview's stat cards and the `get_stats`
 * MCP tool (ADR-0036 parity — one engine, two surfaces).
 *
 * The aggregation itself lives in {@link computeWorkspaceStats} (Fastify-free), which the `get_stats`
 * MCP tool calls too — so the two surfaces cannot drift into reporting different numbers for the
 * same tenant (ADR-0036). This route is the HTTP shell: authorize, resolve the tenant, serialize.
 *
 * **Not audited, deliberately.** It is a low-sensitivity aggregate read on every page load; writing
 * an audit row per load would flood the trail F-027 built and degrade the compliance signal it
 * exists to give. The mutating surfaces it summarizes are each audited at their own route.
 */
export function registerStatsRoutes(app: ZodFastify, services: ApiServices): void {
  app.get(
    '/stats',
    {
      preHandler: requirePermission('stats:read'),
      schema: {
        tags: ['stats'],
        summary:
          'The workspace summary: indexed documents, memories, graph size, sources, last scan.',
        response: { 200: statsResponseSchema },
      },
    },
    (request) => computeWorkspaceStats(services, tenantOf(request)),
  );
}
