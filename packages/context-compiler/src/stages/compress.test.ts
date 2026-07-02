import { describe, expect, it } from 'vitest';
import { estimateTokens } from '../tokens.js';
import { compressToBudget } from './compress.js';
import type { ResolvedCandidate } from './resolve.js';

function resolved(ref: string, text: string): ResolvedCandidate {
  return {
    candidate: { ref, score: 1, signals: ['keyword'] },
    fragment: { ref, text, kind: 'text' },
  };
}

describe('compressToBudget', () => {
  it('never exceeds the budget and drops what does not fit', () => {
    // Each 8-char text estimates to 2 tokens; a budget of 4 fits two.
    const { selected, dropped, totalTokens } = compressToBudget(
      [resolved('a', 'aaaaaaaa'), resolved('b', 'bbbbbbbb'), resolved('c', 'cccccccc')],
      4,
    );

    expect(selected.map((s) => s.item.candidate.ref)).toEqual(['a', 'b']);
    expect(totalTokens).toBeLessThanOrEqual(4);
    expect(dropped[0]?.ref).toBe('c');
  });

  it('skips an oversized un-splittable fragment but still includes a smaller later one (graceful)', () => {
    const { selected } = compressToBudget(
      [resolved('big', 'xxxxxxxxxxxxxxxx'), resolved('small', 'yy')],
      2,
    );

    expect(selected.map((s) => s.item.candidate.ref)).toEqual(['small']);
  });

  it('compresses an over-budget fragment to fit rather than dropping it (FR-31)', () => {
    // A multi-line fragment (~50 tokens) with one line matching the query; budget fits only an excerpt.
    const lines = [
      'irrelevant preamble about unrelated setup steps and boilerplate content here',
      'the authentication token refresh happens in the session middleware layer',
      'more unrelated trailing notes about formatting and style conventions here',
    ].join('\n');
    // Budget fits only the single query-relevant line (~18 tokens), forcing the rest to be excerpted out.
    const budget = 20;

    const { selected, dropped, totalTokens } = compressToBudget([resolved('doc', lines)], budget, {
      query: 'authentication token refresh',
    });

    expect(dropped).toHaveLength(0);
    expect(selected).toHaveLength(1);
    const item = selected[0];
    expect(item?.compressed).toBeDefined();
    expect(item?.compressed?.originalTokens).toBe(estimateTokens(lines));
    // The excerpt keeps the query-relevant line and drops irrelevant ones.
    expect(item?.compressed?.text).toContain('authentication token refresh');
    expect(item?.compressed?.text).not.toContain('boilerplate');
    expect(totalTokens).toBeLessThanOrEqual(budget);
    expect(item?.tokens).toBe(estimateTokens(item?.compressed?.text ?? ''));
  });

  it('keeps whole fragments whole and reports no compression when everything fits', () => {
    const result = compressToBudget([resolved('a', 'aaaa'), resolved('b', 'bbbb')], 100, {
      query: 'anything',
    });

    expect(result.compressedCount).toBe(0);
    expect(result.tokensSaved).toBe(0);
    expect(result.selected.every((s) => s.compressed === undefined)).toBe(true);
  });
});
