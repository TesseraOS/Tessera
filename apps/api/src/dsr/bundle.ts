import type { TenantId } from '@tessera/core';
import type { GraphEdge, GraphNode } from '@tessera/knowledge-graph';
import type { Memory } from '@tessera/memory';
import type { AuditEvent } from '../audit/model.js';
import { collectAuditTrail } from '../audit/collect.js';
import type { AuditLog } from '../audit/port.js';
import { tenantProjectIds } from '../projects/enumerate.js';
import type { ApiServices } from '../services.js';

/** A registered source as exported (tenancy stays off the wire — ADR-0033, mirroring `/v1/sources`). */
export interface DsrSource {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly config: Record<string, unknown>;
  readonly createdAt: string;
}

/**
 * A complete, tenant-scoped export of everything Tessera holds for one tenant (NFR-13, F-047) — the
 * data-subject-rights "right of access" answer. Every section is exhaustive, not display-capped:
 * `memories` carries **every version** (superseded included) so the full lineage is auditable, `graph`
 * is the whole node/edge set, and `audit` is the entire trail.
 */
export interface DsrBundle {
  readonly tenantId: string;
  /** ISO-8601 time the bundle was assembled. */
  readonly exportedAt: string;
  readonly memories: readonly Memory[];
  readonly graph: { readonly nodes: readonly GraphNode[]; readonly edges: readonly GraphEdge[] };
  readonly sources: readonly DsrSource[];
  readonly audit: readonly AuditEvent[];
}

/** Drop `tenantId` from a stored source, mirroring the `/v1/sources` wire projection. */
function toDsrSource(record: {
  id: string;
  kind: string;
  label: string;
  config: Record<string, unknown>;
  createdAt: string;
}): DsrSource {
  return {
    id: record.id,
    kind: record.kind,
    label: record.label,
    config: { ...record.config },
    createdAt: record.createdAt,
  };
}

// The trail walk now lives in `../audit/collect.js` — F-063's audit export needs the same loop, and
// an audit route importing from `dsr/` would be the wrong dependency direction. DSR keeps its
// unbounded behaviour by passing `cap: undefined`: a right-of-access answer must be complete or it is
// not an answer, whereas an export button gets a stated bound.

/**
 * Assemble the {@link DsrBundle} for `tenantId` (NFR-13). A right-of-access answer must be **complete**,
 * so the data plane is exported across **every project** the tenant owns (FR-66, ADR-0037) — a bare
 * `forTenant` view would cover only the default project and silently omit the rest. Reads never cross
 * tenants. The audit trail is tenant-level (events carry no project) and is collected once, unbounded. A
 * deployment with no source service (e.g. doc generation) exports an empty `sources` list rather than
 * failing — the rest of the bundle is still complete.
 */
export async function buildDsrBundle(
  services: ApiServices,
  auditLog: AuditLog,
  tenantId: TenantId,
): Promise<DsrBundle> {
  const projectIds = await tenantProjectIds(services.projects, tenantId);

  const memories: Memory[] = [];
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const sources: DsrSource[] = [];
  for (const projectId of projectIds) {
    const scope = { tenant: tenantId, project: projectId } as const;
    const [projectMemories, projectGraph] = await Promise.all([
      services.memory.forTenant(scope.tenant).forProject(scope.project).exportAll(),
      services.graph.forTenant(scope.tenant).forProject(scope.project).exportAll(),
    ]);
    memories.push(...projectMemories);
    nodes.push(...projectGraph.nodes);
    edges.push(...projectGraph.edges);
    if (services.sources !== undefined) {
      const list = await services.sources.forTenant(scope.tenant).forProject(scope.project).list();
      sources.push(...list.map(toDsrSource));
    }
  }

  // `cap: undefined` keeps DSR unbounded: a right-of-access answer must be COMPLETE or it is not an
  // answer. The audit export button takes the default cap instead, and says when it applies.
  const audit = await collectAuditTrail(auditLog.forTenant(tenantId), {}, undefined);

  return {
    tenantId,
    exportedAt: new Date().toISOString(),
    memories,
    graph: { nodes, edges },
    sources,
    audit: audit.events,
  };
}
