import { describe, expect, it } from 'vitest';
import type { NodeId } from '../domain.js';
import { selectBestRanked, type RawEffectHit } from './ranking.js';

const id = (value: string): NodeId => value as NodeId;
const hit = (nodeId: string, distance: number, score: number): RawEffectHit => ({
  nodeId: id(nodeId),
  path: [],
  distance,
  score,
});

describe('selectBestRanked', () => {
  it('keeps the highest-scoring path per node', () => {
    const ranked = selectBestRanked([hit('b', 1, 0.5), hit('b', 2, 0.9)]);

    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.score).toBe(0.9);
    expect(ranked[0]?.distance).toBe(2);
  });

  it('sorts by score desc, then distance asc, then id asc', () => {
    const ranked = selectBestRanked([hit('c', 2, 0.4), hit('b', 1, 0.8), hit('a', 1, 0.8)]);

    expect(ranked.map((entry) => entry.nodeId)).toEqual([id('a'), id('b'), id('c')]);
  });
});
