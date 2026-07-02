import { describe, expect, it } from 'vitest';
import { createInMemoryCompilationCache } from './cache.js';
import type { ContextPackage } from './domain.js';

function pkg(task: string): ContextPackage {
  return {
    task,
    budget: 1,
    sections: [],
    totalTokens: 0,
    trace: { stages: [] },
    scores: { fragmentCount: 0, budgetAdherence: 1, provenanceCoverage: 1, redundancy: 0 },
  };
}

describe('createInMemoryCompilationCache (LRU)', () => {
  it('stores and returns packages by key', async () => {
    const cache = createInMemoryCompilationCache();

    expect(await cache.get('k')).toBeUndefined();
    await cache.set('k', pkg('a'));
    expect((await cache.get('k'))?.task).toBe('a');
  });

  it('evicts the least-recently-used entry past capacity', async () => {
    const cache = createInMemoryCompilationCache({ maxEntries: 2 });

    await cache.set('a', pkg('a'));
    await cache.set('b', pkg('b'));
    await cache.get('a'); // bump 'a' → 'b' is now least-recently-used
    await cache.set('c', pkg('c')); // exceeds capacity → evicts 'b'

    expect(await cache.get('b')).toBeUndefined();
    expect((await cache.get('a'))?.task).toBe('a');
    expect((await cache.get('c'))?.task).toBe('c');
  });
});
