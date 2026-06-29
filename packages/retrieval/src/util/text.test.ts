import { describe, expect, it } from 'vitest';
import { extractTerms } from './text.js';

describe('extractTerms', () => {
  it('lowercases, splits on non-identifier characters, and de-duplicates', () => {
    expect(extractTerms('Parse the parseQuery() — Parse!')).toEqual(['parse', 'the', 'parsequery']);
  });

  it('returns an empty array for punctuation-only input', () => {
    expect(extractTerms('  --- ??? ')).toEqual([]);
  });
});
