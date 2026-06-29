import { createHash } from 'node:crypto';
import type { Id } from '@tessera/core';

/** Kinds of nodes the project knowledge graph models (ARCHITECTURE §5, FR-16). */
export const NODE_KINDS = ['file', 'symbol', 'module', 'person', 'decision', 'memory'] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

/** Structural edge kinds (everything except the effect-link). */
export const STRUCTURAL_EDGE_KINDS = [
  'imports',
  'calls',
  'references',
  'contains',
  'owns',
  'defines',
  'supersedes',
] as const;
export type StructuralEdgeKind = (typeof STRUCTURAL_EDGE_KINDS)[number];

/** All edge kinds. `EFFECT_LINK` is the typed "change A ⇒ review B" edge (FR-17). */
export const EDGE_KINDS = [...STRUCTURAL_EDGE_KINDS, 'EFFECT_LINK'] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

/** The edge kind that denotes an effect-link. */
export const EFFECT_LINK_KIND: EdgeKind = 'EFFECT_LINK';

/**
 * Dependency edges whose direction is *inverted* to derive static effect-links: if a dependent
 * imports/calls/references a dependency, then changing the dependency may require reviewing the
 * dependent (FR-18).
 */
export const DEPENDENCY_EDGE_KINDS = [
  'imports',
  'calls',
  'references',
] as const satisfies readonly StructuralEdgeKind[];

/** How an effect-link was established (ARCHITECTURE §10). */
export const EFFECT_ORIGINS = ['static', 'manual', 'learned'] as const;
export type EffectOrigin = (typeof EFFECT_ORIGINS)[number];

export type NodeId = Id<'GraphNode'>;
export type EdgeId = Id<'GraphEdge'>;

/** Structured, JSON-safe, non-sensitive metadata on a node or edge. */
export type GraphMetadata = Readonly<Record<string, unknown>>;

/** A node in the knowledge graph. `key` is its stable natural key within its kind (e.g. a file path). */
export interface GraphNode {
  readonly id: NodeId;
  readonly kind: NodeKind;
  readonly key: string;
  readonly label: string;
  readonly metadata: GraphMetadata;
}

/**
 * A directed, typed edge. For `EFFECT_LINK` edges, `rationale`/`confidence`/`origin` are set; for
 * structural edges they are `null`.
 */
export interface GraphEdge {
  readonly id: EdgeId;
  readonly from: NodeId;
  readonly to: NodeId;
  readonly kind: EdgeKind;
  readonly rationale: string | null;
  readonly confidence: number | null;
  readonly origin: EffectOrigin | null;
  readonly metadata: GraphMetadata;
}

/** One affected node returned by `get_effects`, with the path that reaches it and a score (FR-19). */
export interface EffectHit {
  readonly nodeId: NodeId;
  readonly node: GraphNode;
  /** Node ids from the changed node (inclusive) to this dependent (inclusive). */
  readonly path: readonly NodeId[];
  /** Number of effect-link hops from the source (path length minus one). */
  readonly distance: number;
  /** Product of edge confidences along the path; higher = more certain/closer. */
  readonly score: number;
}

const SEPARATOR = '|';

function sha256Id(parts: readonly string[]): string {
  return createHash('sha256').update(parts.join(SEPARATOR)).digest('hex');
}

/** Deterministic node id from `(kind, key)` so re-upserting the same node is idempotent. */
export function nodeIdFor(kind: NodeKind, key: string): NodeId {
  return sha256Id([kind, key]) as NodeId;
}

/** Deterministic edge id from `(from, to, kind)` so re-asserting the same edge is idempotent. */
export function edgeIdFor(from: NodeId, to: NodeId, kind: EdgeKind): EdgeId {
  return sha256Id([from, to, kind]) as EdgeId;
}
