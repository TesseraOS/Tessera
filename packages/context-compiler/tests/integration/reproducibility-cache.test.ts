import { describe, expect, it } from 'vitest';
import type { FusedCandidate, HybridRetriever } from '@tessera/retrieval';
import { createInMemoryCompilationCache } from '../../src/cache';
import { createContextCompiler } from '../../src/compiler';
import type { FragmentSource } from '../../src/ports/fragment-source';
import type { CompressionStrategy, RankStrategy } from '../../src/strategies';

const FRAGS: Record<string, string> = {
  'file:a': 'alpha authentication oauth login flow with bearer tokens and sessions here',
  'file:b': 'beta database migrations and schema changes with drizzle kit tooling here',
};

/** A HybridRetriever that surfaces the fixed corpus and counts how many times it was queried. */
function countingRetriever(): HybridRetriever & { calls: () => number } {
  let calls = 0;
  return {
    calls: () => calls,
    search: () => {
      calls += 1;
      return Promise.resolve(
        Object.keys(FRAGS).map((ref, index): FusedCandidate => ({
          ref,
          score: 1 - index * 0.1,
          signals: [{ signal: 'keyword', rank: index + 1, score: 1, weight: 1, contribution: 1 }],
        })),
      );
    },
  };
}

const source: FragmentSource = {
  get: (ref) =>
    Promise.resolve(FRAGS[ref] !== undefined ? { ref, text: FRAGS[ref], kind: 'code' } : undefined),
};

describe('compiler reproducibility + caching + pluggable strategies (F-020)', () => {
  it('serves an identical compile from cache without re-running retrieval', async () => {
    const retriever = countingRetriever();
    const compiler = createContextCompiler({
      retriever,
      fragmentSource: source,
      cache: createInMemoryCompilationCache(),
    });

    const first = await compiler.compile({ task: 'authentication oauth', budget: 1000 });
    const callsAfterFirst = retriever.calls();
    expect(callsAfterFirst).toBeGreaterThan(0);

    const second = await compiler.compile({ task: 'authentication oauth', budget: 1000 });
    expect(retriever.calls()).toBe(callsAfterFirst); // cache hit → no more retrieval
    expect(second).toEqual(first); // identical package

    await compiler.compile({ task: 'a different task entirely', budget: 1000 });
    expect(retriever.calls()).toBeGreaterThan(callsAfterFirst); // miss → retrieval ran again
  });

  it('is reproducible without a cache (same inputs → equal sections/scores)', async () => {
    const compiler = createContextCompiler({
      retriever: countingRetriever(),
      fragmentSource: source,
    });

    const a = await compiler.compile({ task: 'authentication oauth', budget: 1000 });
    const b = await compiler.compile({ task: 'authentication oauth', budget: 1000 });

    expect(b.sections).toEqual(a.sections);
    expect(b.totalTokens).toBe(a.totalTokens);
    expect(b.scores).toEqual(a.scores);
  });

  it('swaps the compressor strategy without an API change', async () => {
    const bigText = [
      'FIRST relevant line about authentication tokens and sessions here',
      'second filler line of unrelated padding content that should be dropped',
      'third filler line of unrelated padding content that should be dropped',
    ].join('\n');
    const bigSource: FragmentSource = {
      get: (ref) =>
        Promise.resolve(ref === 'file:big' ? { ref, text: bigText, kind: 'code' } : undefined),
    };
    const bigRetriever: HybridRetriever = {
      search: () =>
        Promise.resolve([
          {
            ref: 'file:big',
            score: 1,
            signals: [{ signal: 'keyword', rank: 1, score: 1, weight: 1, contribution: 1 }],
          },
        ]),
    };
    // A strategy that keeps only the first line — proves the injected compressor is what runs.
    const firstLineOnly: CompressionStrategy = {
      id: 'first-line',
      compress: (text, _query, target) => {
        const line = text.split('\n')[0] ?? '';
        const tokens = Math.ceil(line.length / 4);
        return line.length > 0 && tokens <= target ? { text: line, tokens } : undefined;
      },
    };

    const compiler = createContextCompiler({
      retriever: bigRetriever,
      fragmentSource: bigSource,
      compression: firstLineOnly,
    });
    const budget = 20; // below the fragment's full size → forces compression

    const pkg = await compiler.compile({ task: 'authentication', budget });
    const fragment = pkg.sections.flatMap((section) => section.fragments)[0];

    expect(fragment?.text).toBe(
      'FIRST relevant line about authentication tokens and sessions here',
    );
    expect(fragment?.whyIncluded).toMatch(/compressed to fit budget/);
    expect(pkg.totalTokens).toBeLessThanOrEqual(budget);
    // The package shape is unchanged (FR-34: swap without an API change).
    expect(pkg.scores).toHaveProperty('budgetAdherence');
  });

  it('swaps the ranker strategy without an API change', async () => {
    const byRefDescending: RankStrategy = {
      id: 'ref-desc',
      rank: (candidates) =>
        [...candidates].sort((x, y) => (x.ref < y.ref ? 1 : x.ref > y.ref ? -1 : 0)),
    };
    const compiler = createContextCompiler({
      retriever: countingRetriever(),
      fragmentSource: source,
      rankStrategy: byRefDescending,
    });

    const pkg = await compiler.compile({ task: 'authentication oauth', budget: 1000 });
    const refs = pkg.sections.flatMap((section) => section.fragments).map((f) => f.ref);

    // Under descending-ref ranking, file:b precedes file:a (the default relevance ranker gives a first).
    expect(refs.indexOf('file:b')).toBeLessThan(refs.indexOf('file:a'));
  });
});
