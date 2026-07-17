import type { TenantId } from '@tessera/core';
import type { GraphEdge, GraphNode } from '@tessera/knowledge-graph';
import type { Memory } from '@tessera/memory';
import type { AuditEvent } from '../audit/model.js';
import { collectAuditTrail } from '../audit/collect.js';
import type { AuditLog } from '../audit/port.js';
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
 * Assemble the {@link DsrBundle} for `tenantId` (NFR-13). Every read is tenant-scoped via `forTenant`
 * (ADR-0033), so one tenant's export can never contain another's data. A deployment with no source
 * service (e.g. doc generation) exports an empty `sources` list rather than failing — the rest of the
 * bundle is still complete.
 */
export async function buildDsrBundle(
  services: ApiServices,
  auditLog: AuditLog,
  tenantId: TenantId,
): Promise<DsrBundle> {
  const [memories, graph, audit] = await Promise.all([
    services.memory.forTenant(tenantId).exportAll(),
    services.graph.forTenant(tenantId).exportAll(),
    // `cap: undefined` keeps DSR unbounded: a right-of-access answer must be COMPLETE or it is not an
    // answer. The audit export button takes the default cap instead, and says when it applies.
    collectAuditTrail(auditLog.forTenant(tenantId), {}, undefined),
  ]);
  const sources =
    services.sources === undefined ? [] : await services.sources.forTenant(tenantId).list();

  return {
    tenantId,
    exportedAt: new Date().toISOString(),
    memories,
    graph: { nodes: graph.nodes, edges: graph.edges },
    sources: sources.map(toDsrSource),
    audit: audit.events,
  };
}
