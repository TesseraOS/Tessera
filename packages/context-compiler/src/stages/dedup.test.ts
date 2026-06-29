import { describe, expect, it } from 'vitest';
import { dedupeFragments } from './dedup.js';
import type { ResolvedCandidate } from './resolve.js';

function resolved(ref: string, text: string): ResolvedCandidate {
  return {
    candidate: { ref, score: 1, signals: ['keyword'] },
    fragment: { ref, text, kind: 'text' },
  };
}

describe('dedupeFragments', () => {
  it('drops a near-duplicate, keeping the first (highest-ranked)', () => {
    const { kept, dropped } = dedupeFragments([
      resolved('a', 'the quick brown fox jumps over the lazy dog'),
      resolved('a2', 'the quick brown fox jumps over the lazy dog!!!'),
      resolved('b', 'completely unrelated content about database migrations'),
    ]);

    expect(kept.map((item) => item.candidate.ref)).toEqual(['a', 'b']);
    expect(dropped[0]?.ref).toBe('a2');
    expect(dropped[0]?.reason).toContain('near-duplicate of a');
  });

  it('keeps distinct fragments', () => {
    const { kept, dropped } = dedupeFragments([
      resolved('a', 'authentication and login'),
      resolved('b', 'database migrations and indexes'),
    ]);

    expect(kept).toHaveLength(2);
    expect(dropped).toHaveLength(0);
  });
});
