import { describe, expect, it } from 'vitest';
import { rankCandidates } from './rank.js';

describe('rankCandidates', () => {
  it('boosts multi-signal candidates above single-signal ones at the same base score', () => {
    const ranked = rankCandidates([
      { ref: 'single', score: 0.5, signals: ['semantic'] },
      { ref: 'multi', score: 0.5, signals: ['semantic', 'keyword'] },
    ]);

    expect(ranked[0]?.ref).toBe('multi');
  });

  it('orders by score descending with a deterministic ref tiebreak', () => {
    const ranked = rankCandidates([
      { ref: 'b', score: 0.3, signals: ['keyword'] },
      { ref: 'a', score: 0.3, signals: ['keyword'] },
      { ref: 'c', score: 0.9, signals: ['keyword'] },
    ]);

    expect(ranked.map((c) => c.ref)).toEqual(['c', 'a', 'b']);
  });
});
