import { describe, expect, it } from 'vitest';
import type { Candidate, RetrieverKind } from '../domain.js';
import { DEFAULT_RRF_K, fuse, type RetrieverResult } from './fuse.js';

function result(signal: RetrieverKind, refs: readonly string[]): RetrieverResult {
  return {
    signal,
    candidates: refs.map((ref): Candidate => ({ ref, signal, score: 1 })),
  };
}

describe('fuse', () => {
  it('ranks an item matched by two signals above one matched by a single signal', () => {
    const fused = fuse([result('semantic', ['a', 'b']), result('keyword', ['a', 'c'])]);

    expect(fused[0]?.ref).toBe('a'); // hit by both signals
    expect(fused[0]?.signals.map((s) => s.signal).sort()).toEqual(['keyword', 'semantic']);
  });

  it('records per-candidate attribution with the RRF contribution', () => {
    const [top] = fuse([result('semantic', ['x'])]);

    expect(top?.signals).toHaveLength(1);
    expect(top?.signals[0]).toMatchObject({ signal: 'semantic', rank: 1, weight: 1 });
    expect(top?.signals[0]?.contribution).toBeCloseTo(1 / (DEFAULT_RRF_K + 1));
    expect(top?.score).toBeCloseTo(1 / (DEFAULT_RRF_K + 1));
  });

  it('applies per-signal weights and drops a signal weighted 0', () => {
    const fused = fuse(
      [result('semantic', ['only-semantic']), result('keyword', ['only-keyword'])],
      {
        weights: { keyword: 0 },
      },
    );

    expect(fused.map((c) => c.ref)).toEqual(['only-semantic']);
  });

  it('lets weights change the ranking', () => {
    const results = [result('semantic', ['s']), result('keyword', ['k'])];

    const keywordHeavy = fuse(results, { weights: { keyword: 5 } });
    expect(keywordHeavy[0]?.ref).toBe('k');

    const semanticHeavy = fuse(results, { weights: { semantic: 5 } });
    expect(semanticHeavy[0]?.ref).toBe('s');
  });

  it('truncates to the requested limit', () => {
    const fused = fuse([result('semantic', ['a', 'b', 'c', 'd'])], { limit: 2 });

    expect(fused).toHaveLength(2);
  });
});
