import { describe, expect, it } from 'vitest';
import { fitToBudget } from './compress.js';
import type { ResolvedCandidate } from './resolve.js';

function resolved(ref: string, text: string): ResolvedCandidate {
  return {
    candidate: { ref, score: 1, signals: ['keyword'] },
    fragment: { ref, text, kind: 'text' },
  };
}

describe('fitToBudget', () => {
  it('never exceeds the budget and drops what does not fit', () => {
    // Each 8-char text estimates to 2 tokens; a budget of 4 fits two.
    const { selected, dropped, totalTokens } = fitToBudget(
      [resolved('a', 'aaaaaaaa'), resolved('b', 'bbbbbbbb'), resolved('c', 'cccccccc')],
      4,
    );

    expect(selected.map((s) => s.item.candidate.ref)).toEqual(['a', 'b']);
    expect(totalTokens).toBeLessThanOrEqual(4);
    expect(dropped[0]?.ref).toBe('c');
  });

  it('skips an oversized fragment but still includes a smaller later one (graceful)', () => {
    const { selected } = fitToBudget(
      [resolved('big', 'xxxxxxxxxxxxxxxx'), resolved('small', 'yy')],
      2,
    );

    expect(selected.map((s) => s.item.candidate.ref)).toEqual(['small']);
  });
});
