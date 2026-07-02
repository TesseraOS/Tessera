import { describe, expect, it } from 'vitest';
import { estimateTokens } from '../tokens.js';
import { compressToFit } from './compress-text.js';

const TEXT = [
  'The database migration runs drizzle-kit against the sqlite schema.',
  'Authentication uses OAuth tokens refreshed by the session middleware.',
  'Unrelated notes about code formatting and prettier configuration follow.',
].join('\n');

describe('compressToFit', () => {
  it('keeps the query-relevant segment and drops irrelevant ones', () => {
    const result = compressToFit(TEXT, 'oauth tokens authentication', 20);

    expect(result).toBeDefined();
    expect(result?.text).toContain('Authentication uses OAuth tokens');
    expect(result?.text).not.toContain('prettier');
  });

  it('never exceeds the target token budget', () => {
    for (const target of [5, 10, 20, 40]) {
      const result = compressToFit(TEXT, 'database schema', target);
      if (result !== undefined) {
        expect(result.tokens).toBeLessThanOrEqual(target);
        expect(result.tokens).toBe(estimateTokens(result.text));
      }
    }
  });

  it('preserves original order of the chosen segments', () => {
    // Both the first and second lines are relevant; the excerpt must keep them in source order.
    const result = compressToFit(TEXT, 'database migration oauth tokens', 40);
    const text = result?.text ?? '';
    expect(text.indexOf('database migration')).toBeLessThan(text.indexOf('OAuth tokens'));
  });

  it('returns undefined when not even one segment fits', () => {
    expect(compressToFit(TEXT, 'database', 1)).toBeUndefined();
    expect(compressToFit(TEXT, 'database', 0)).toBeUndefined();
    expect(compressToFit('', 'anything', 100)).toBeUndefined();
  });

  it('is deterministic across runs', () => {
    const a = compressToFit(TEXT, 'oauth database', 25);
    const b = compressToFit(TEXT, 'oauth database', 25);
    expect(a).toEqual(b);
  });
});
