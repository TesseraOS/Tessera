import type { NodeId } from '../domain.js';

/** A candidate path to an affected node, before deduplication/ranking. */
export interface RawEffectHit {
  readonly nodeId: NodeId;
  readonly path: readonly NodeId[];
  readonly distance: number;
  readonly score: number;
}

function isBetter(a: RawEffectHit, b: RawEffectHit): boolean {
  if (a.score !== b.score) return a.score > b.score;
  if (a.distance !== b.distance) return a.distance < b.distance;
  return a.nodeId < b.nodeId;
}

function compareHits(a: RawEffectHit, b: RawEffectHit): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.distance !== b.distance) return a.distance - b.distance;
  return a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0;
}

/**
 * Reduce candidate paths to one ranked hit per affected node: keep the highest-scoring path to each
 * node, then sort by score desc → distance asc → node id asc. Deterministic, and shared by every
 * adapter so their `get_effects` results match (conformance parity).
 */
export function selectBestRanked(candidates: readonly RawEffectHit[]): RawEffectHit[] {
  const best = new Map<NodeId, RawEffectHit>();
  for (const candidate of candidates) {
    const current = best.get(candidate.nodeId);
    if (current === undefined || isBetter(candidate, current)) {
      best.set(candidate.nodeId, candidate);
    }
  }
  return [...best.values()].sort(compareHits);
}
