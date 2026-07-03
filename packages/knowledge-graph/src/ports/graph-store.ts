import type { TenantId } from '@tessera/core';
import type { EdgeKind, EffectHit, GraphEdge, GraphNode, NodeId, NodeKind } from '../domain.js';

/** Default maximum effect-link hops traversed by `get_effects`. */
export const DEFAULT_EFFECT_DEPTH = 6;

export interface NodeFilter {
  readonly kind?: NodeKind;
}

export interface EdgeFilter {
  readonly kind?: EdgeKind;
  readonly from?: NodeId;
  readonly to?: NodeId;
}

export interface GetEffectsOptions {
  /** Maximum number of effect-link hops to traverse (default {@link DEFAULT_EFFECT_DEPTH}). */
  readonly maxDepth?: number;
}

/**
 * Persistence + traversal port for the knowledge graph (ADR-0003). Adapters: in-memory (reference)
 * and SQLite (relational, recursive-CTE traversal — ARCHITECTURE §10). Node/edge writes are
 * idempotent by deterministic id. `getEffects` walks outgoing `EFFECT_LINK` edges transitively and
 * returns ranked dependents with their paths (FR-19).
 *
 * **Tenancy (FR-52, ADR-0033):** node ids are deterministic from `(kind, key)`, so the same node can
 * exist in different tenants; a store scopes every node/edge by tenant. The base store operates in
 * {@link DEFAULT_TENANT_ID}; {@link GraphStore.forTenant} confines all reads, writes, and effect
 * traversal to one tenant.
 */
export interface GraphStore {
  addNode(node: GraphNode): Promise<void>;
  addEdge(edge: GraphEdge): Promise<void>;
  getNode(id: NodeId): Promise<GraphNode | undefined>;
  getNodeByKey(kind: NodeKind, key: string): Promise<GraphNode | undefined>;
  listNodes(filter?: NodeFilter): Promise<readonly GraphNode[]>;
  listEdges(filter?: EdgeFilter): Promise<readonly GraphEdge[]>;
  getEffects(source: NodeId, options?: GetEffectsOptions): Promise<readonly EffectHit[]>;
  /** A view of this store confined to `tenantId` (FR-52). */
  forTenant(tenantId: TenantId): GraphStore;
}
