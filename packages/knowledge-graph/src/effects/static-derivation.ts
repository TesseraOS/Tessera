import {
  DEPENDENCY_EDGE_KINDS,
  EFFECT_LINK_KIND,
  edgeIdFor,
  type EdgeKind,
  type GraphEdge,
} from '../domain.js';

/** Confidence for statically-derived effect-links — high, since they come from real dependencies. */
export const STATIC_EFFECT_CONFIDENCE = 0.9;

const DEPENDENCY_KINDS = new Set<EdgeKind>(DEPENDENCY_EDGE_KINDS);

/**
 * Derive effect-links from structural dependency edges (FR-18). A dependent that
 * imports/calls/references a dependency means **changing the dependency may require reviewing the
 * dependent**, so we emit the inverse edge `dependency --EFFECT_LINK--> dependent` with origin
 * `static`. Idempotent (deterministic edge id); structural and existing effect edges are ignored.
 */
export function staticEffectLinksFrom(edges: readonly GraphEdge[]): GraphEdge[] {
  const links: GraphEdge[] = [];
  for (const edge of edges) {
    if (!DEPENDENCY_KINDS.has(edge.kind)) continue;
    const from = edge.to; // the dependency that, when changed, has consequences
    const to = edge.from; // the dependent that must be reviewed
    links.push({
      id: edgeIdFor(from, to, EFFECT_LINK_KIND),
      from,
      to,
      kind: EFFECT_LINK_KIND,
      rationale: `dependent ${edge.kind} this node; changing it may require reviewing the dependent`,
      confidence: STATIC_EFFECT_CONFIDENCE,
      origin: 'static',
      metadata: { derivedFrom: edge.id },
    });
  }
  return links;
}
