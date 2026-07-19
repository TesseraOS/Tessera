import { DEFAULT_PROJECT_ID, type ProjectId, type TenantId } from '@tessera/core';
import type { ApiServices } from '../services.js';

/**
 * The workspace summary (F-060) — Fastify-free so **both** surfaces compute it with the same code.
 *
 * This module exists to make ADR-0036's "one engine, two surfaces" structural rather than
 * aspirational: `GET /v1/stats` and the `get_stats` MCP tool both call {@link computeWorkspaceStats},
 * so they cannot drift into reporting different numbers for the same tenant. The MCP runtime must
 * never pull Fastify in (the F-012 invariant), which is why this lives behind the `@tessera/api/stats`
 * subpath rather than the package root.
 */

/** What a workspace actually contains, for one tenant. See `apps/api/src/schemas/stats.ts`. */
export interface WorkspaceStats {
  readonly documents: number;
  readonly memories: number;
  readonly graph: { readonly nodes: number; readonly effectLinks: number };
  readonly sources: number;
  readonly lastScanAt: string | null;
}

/**
 * Count everything the given `(tenant, project)` scope actually has. Every read is scoped via
 * `forTenant().forProject()` (ADR-0033/0037) and counted at the store rather than by listing — this runs
 * on every dashboard load, for the currently selected project (`projectId` defaults to the reserved
 * default project, so a single-project deployment is unchanged).
 *
 * A deployment without runtime source management (`services.sources` unset) still has real memory +
 * graph numbers, so the sources half reports zeros rather than failing the whole summary.
 */
export async function computeWorkspaceStats(
  services: ApiServices,
  tenantId: TenantId,
  projectId: ProjectId = DEFAULT_PROJECT_ID,
): Promise<WorkspaceStats> {
  const sourceSummary =
    services.sources === undefined
      ? { sources: 0, documents: 0, lastScanAt: null }
      : await services.sources.forTenant(tenantId).forProject(projectId).summary();

  const [memories, graph] = await Promise.all([
    services.memory.forTenant(tenantId).forProject(projectId).count(),
    services.graph.forTenant(tenantId).forProject(projectId).counts(),
  ]);

  return {
    documents: sourceSummary.documents,
    memories,
    graph: { nodes: graph.nodes, effectLinks: graph.effectLinks },
    sources: sourceSummary.sources,
    lastScanAt: sourceSummary.lastScanAt,
  };
}
