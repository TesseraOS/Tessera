import { describe, expect, it } from 'vitest';
import { jaccard, shingles } from './shingle.js';

describe('shingles + jaccard', () => {
  it('scores identical text as 1', () => {
    expect(
      jaccard(shingles('the quick brown fox jumps'), shingles('the quick brown fox jumps')),
    ).toBe(1);
  });

  it('scores disjoint text as 0', () => {
    expect(jaccard(shingles('alpha beta gamma delta'), shingles('one two three four'))).toBe(0);
  });

  it('ignores punctuation and case when comparing', () => {
    expect(jaccard(shingles('The Quick Brown Fox'), shingles('the quick brown fox!!!'))).toBe(1);
  });

  it('scores a partial overlap between 0 and 1', () => {
    const score = jaccard(
      shingles('the quick brown fox jumps over'),
      shingles('the quick brown fox leaps across'),
    );
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });
});
