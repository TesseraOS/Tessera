import type { TenantId } from '@tessera/core';
import { tenantProjectIds } from '../projects/enumerate.js';
import type { ApiServices } from '../services.js';

/** What a {@link purgeTenant} erasure removed, per domain. */
export interface DsrPurgeSummary {
  /** Memory lineages deleted (every version of each). */
  readonly memories: number;
  readonly graph: { readonly nodes: number; readonly edges: number };
  readonly sources: number;
}

/**
 * Erase a tenant's **data plane** (NFR-13, F-047): every memory lineage (all versions, de-indexed from
 * the retrieval corpus by the indexing decorator, so nothing stays searchable), the whole knowledge
 * graph, and every registered source — across **every project** the tenant owns (FR-66, ADR-0037), since
 * a bare `forTenant` view would erase only the default project and leave the rest. Another tenant's data
 * is never touched. The project entities themselves are left in place (an emptied container is not
 * personal data); their contents are gone.
 *
 * The **audit trail is deliberately retained** (ADR-0049): it is the compliance record *of* the erasure
 * and holds no memory/graph/source content — only who did what, when, with what outcome (NFR-7). The
 * `dsr.delete` event for this call is itself recorded by the route's audit hook.
 */
export async function purgeTenant(
  services: ApiServices,
  tenantId: TenantId,
): Promise<DsrPurgeSummary> {
  const projectIds = await tenantProjectIds(services.projects, tenantId);

  let memories = 0;
  let nodes = 0;
  let edges = 0;
  let sources = 0;
  for (const projectId of projectIds) {
    const memory = services.memory.forTenant(tenantId).forProject(projectId);
    const lineages = new Set((await memory.exportAll()).map((version) => version.lineageId));
    for (const lineageId of lineages) {
      await memory.deleteLineage(lineageId);
    }
    memories += lineages.size;

    const graph = await services.graph.forTenant(tenantId).forProject(projectId).purge();
    nodes += graph.nodes;
    edges += graph.edges;

    if (services.sources !== undefined) {
      const scoped = services.sources.forTenant(tenantId).forProject(projectId);
      for (const record of await scoped.list()) {
        await scoped.remove(record.id);
        sources += 1;
      }
    }
  }

  return { memories, graph: { nodes, edges }, sources };
}
