import type { ProjectId, TenantId } from '@tessera/core';
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
 * **Scope (FR-52/FR-66, ADR-0033/0037):** node ids are deterministic from `(kind, key)`, so the same
 * node can exist in different `(tenant, project)` scopes; a store scopes every node/edge by both. The
 * base store operates in `(DEFAULT_TENANT_ID, DEFAULT_PROJECT_ID)`;
 * {@link GraphStore.forTenant}/{@link GraphStore.forProject} confine all reads, writes, and effect
 * traversal to one scope.
 */
export interface GraphStore {
  addNode(node: GraphNode): Promise<void>;
  addEdge(edge: GraphEdge): Promise<void>;
  /**
   * Remove a node and every edge incident to it (idempotent — no error if absent). Used to remove a
   * deleted source file's subgraph (F-040).
   */
  removeNode(id: NodeId): Promise<void>;
  /**
   * Remove every edge matching `filter` (idempotent). Used to replace a changed file's OUTGOING edges
   * on re-ingest (F-040) without clobbering edges from other files. An empty filter removes all edges.
   */
  removeEdges(filter?: EdgeFilter): Promise<void>;
  getNode(id: NodeId): Promise<GraphNode | undefined>;
  getNodeByKey(kind: NodeKind, key: string): Promise<GraphNode | undefined>;
  listNodes(filter?: NodeFilter): Promise<readonly GraphNode[]>;
  listEdges(filter?: EdgeFilter): Promise<readonly GraphEdge[]>;
  /**
   * How many nodes match `filter`, without materializing them. Backs the workspace summary
   * (`GET /v1/stats`, F-060), which is requested on every dashboard load — listing every node to
   * read `.length` would read the whole graph into memory on the hot path.
   */
  countNodes(filter?: NodeFilter): Promise<number>;
  /** How many edges match `filter`, without materializing them. See {@link GraphStore.countNodes}. */
  countEdges(filter?: EdgeFilter): Promise<number>;
  getEffects(source: NodeId, options?: GetEffectsOptions): Promise<readonly EffectHit[]>;
  /** A view of this store confined to `tenantId` (FR-52), reset to that tenant's {@link DEFAULT_PROJECT_ID}. */
  forTenant(tenantId: TenantId): GraphStore;
  /**
   * A view of this store confined to `projectId` **within the current tenant** (FR-66, ADR-0037); chain
   * after {@link GraphStore.forTenant} for a full `(tenant, project)` scope.
   */
  forProject(projectId: ProjectId): GraphStore;
}
