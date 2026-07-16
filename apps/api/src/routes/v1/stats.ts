import type { ZodFastify } from '../../app-types.js';
import { requirePermission, tenantOf } from '../../auth/index.js';
import { statsResponseSchema } from '../../schemas/stats.js';
import type { ApiServices } from '../../services.js';

/**
 * `GET /v1/stats` — the workspace summary (F-060; FR-38/FR-62): how much this tenant actually has
 * indexed, remembered, and connected. Backs the dashboard Overview's stat cards and the `get_stats`
 * MCP tool (ADR-0036 parity — one engine, two surfaces).
 *
 * **Tenant-scoped (ADR-0033):** every count runs through `forTenant(tenantOf(request))`, so one
 * tenant's numbers never include another's rows.
 *
 * **Counted, not listed.** Each number comes from a store-level count (`countNodes`/`countCurrent`/
 * the manifest), never from `list().length` — this endpoint is hit on every dashboard load, and
 * materializing the whole graph to read `.length` would put that cost on the hot path.
 *
 * **Not audited, deliberately.** It is a low-sensitivity aggregate read on every page load; writing
 * an audit row per load would flood the trail F-027 built and degrade the compliance signal it
 * exists to give. The mutating surfaces it summarizes are each audited at their own route.
 *
 * **Composes existing `ApiServices` members only.** It deliberately adds no new member: the
 * observability wrapper (`instrumentServices`, E-015) rebuilds `ApiServices`, and a member it does
 * not forward is silently dropped from the shipped server — that already caused a production 500 for
 * `sources` once (caught by F-041). Reusing `memory`/`graph`/`sources` keeps that trap shut.
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
    async (request) => {
      const tenantId = tenantOf(request);

      // A deployment without runtime source management (services.sources unset — e.g. OpenAPI
      // generation) still has real memory + graph numbers. Report those and zeros for the sources
      // half rather than failing the whole summary: a 500 here would blank the entire Overview over
      // a component the deployment never opted into. Zero sources genuinely means zero documents.
      const sourceSummary =
        services.sources === undefined
          ? { sources: 0, documents: 0, lastScanAt: null }
          : await services.sources.forTenant(tenantId).summary();

      const [memories, graph] = await Promise.all([
        services.memory.forTenant(tenantId).count(),
        services.graph.forTenant(tenantId).counts(),
      ]);

      return {
        documents: sourceSummary.documents,
        memories,
        graph: { nodes: graph.nodes, effectLinks: graph.effectLinks },
        sources: sourceSummary.sources,
        lastScanAt: sourceSummary.lastScanAt,
      };
    },
  );
}
