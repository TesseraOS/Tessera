import type { TenantId } from '@tessera/core';
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
 * graph, and every registered source. Tenant-scoped via `forTenant` (ADR-0033) — another tenant's data
 * is never touched.
 *
 * The **audit trail is deliberately retained** (ADR-0049): it is the compliance record *of* the erasure
 * and holds no memory/graph/source content — only who did what, when, with what outcome (NFR-7). The
 * `dsr.delete` event for this call is itself recorded by the route's audit hook.
 */
export async function purgeTenant(
  services: ApiServices,
  tenantId: TenantId,
): Promise<DsrPurgeSummary> {
  const memory = services.memory.forTenant(tenantId);
  const lineages = new Set((await memory.exportAll()).map((version) => version.lineageId));
  for (const lineageId of lineages) {
    await memory.deleteLineage(lineageId);
  }

  const graph = await services.graph.forTenant(tenantId).purge();

  let sources = 0;
  if (services.sources !== undefined) {
    const scoped = services.sources.forTenant(tenantId);
    for (const record of await scoped.list()) {
      await scoped.remove(record.id);
      sources += 1;
    }
  }

  return { memories: lineages.size, graph, sources };
}
