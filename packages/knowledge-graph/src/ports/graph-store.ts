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
 */
export interface GraphStore {
  addNode(node: GraphNode): Promise<void>;
  addEdge(edge: GraphEdge): Promise<void>;
  getNode(id: NodeId): Promise<GraphNode | undefined>;
  getNodeByKey(kind: NodeKind, key: string): Promise<GraphNode | undefined>;
  listNodes(filter?: NodeFilter): Promise<readonly GraphNode[]>;
  listEdges(filter?: EdgeFilter): Promise<readonly GraphEdge[]>;
  getEffects(source: NodeId, options?: GetEffectsOptions): Promise<readonly EffectHit[]>;
}
