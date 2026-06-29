import { describe, expect, it } from 'vitest';
import { estimateTokens } from './tokens.js';

describe('estimateTokens', () => {
  it('returns 0 for empty text', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('estimates roughly one token per four characters', () => {
    expect(estimateTokens('abcdefgh')).toBe(2);
    expect(estimateTokens('abcde')).toBe(2);
  });
});
