import type { TenantId } from '@tessera/core';
import { tenantProjectIds } from '../projects/enumerate.js';
import type { NotificationStore } from '../notifications/port.js';
import type { ApiServices } from '../services.js';

/** What a {@link purgeTenant} erasure removed, per domain. */
export interface DsrPurgeSummary {
  /** Memory lineages deleted (every version of each). */
  readonly memories: number;
  readonly graph: { readonly nodes: number; readonly edges: number };
  readonly sources: number;
  /** Per-principal notification rows removed (read state + preferences) — F-065. */
  readonly notifications: number;
}

/** Stores that live outside {@link ApiServices} but still hold erasable tenant state. */
export interface PurgeTargets {
  /**
   * Per-principal notification state (F-065). Optional so a hand-composed call still works, but the
   * `/v1/dsr/delete` route always passes it — a store keyed by principal id that survives an
   * erasure request is the gap this parameter exists to close.
   */
  readonly notifications?: NotificationStore;
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
 *
 * Notification state (F-065) is erased, **not** retained — the opposite call to the trail's, and for
 * the reason that distinguishes them: the trail is the record of the erasure, while read marks are
 * pure convenience keyed by the very principal ids the request is about.
 */
export async function purgeTenant(
  services: ApiServices,
  tenantId: TenantId,
  targets: PurgeTargets = {},
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

  // Notification read state + preferences (F-065). Not part of ApiServices, and not project-scoped:
  // a notification is a projection of the tenant's trail, so its state is per (tenant, principal).
  const notifications =
    targets.notifications === undefined
      ? 0
      : await targets.notifications.forTenant(tenantId).purge();

  return { memories, graph: { nodes, edges }, sources, notifications };
}
