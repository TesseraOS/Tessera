import { describe, expect, it } from 'vitest';
import type { FusedCandidate, HybridRetriever } from '@tessera/retrieval';
import { createContextCompiler } from '../../src/compiler';
import type { FragmentSource } from '../../src/ports/fragment-source';
import { estimateTokens } from '../../src/tokens';

const BIG_REF = 'file:big';
const BIG_TEXT = [
  'Intro paragraph about unrelated build tooling and repository layout conventions here.',
  'The retry policy uses exponential backoff with jitter on transient network errors.',
  'A closing note about documentation style and changelog formatting practices follows.',
  'Additional filler describing directory structure and file-naming guidelines at length.',
].join('\n');

/** A minimal HybridRetriever that surfaces fixed refs with a keyword signal. */
function fakeRetriever(refs: readonly string[]): HybridRetriever {
  return {
    search: () =>
      Promise.resolve(
        refs.map((ref, index): FusedCandidate => ({
          ref,
          score: 1 - index * 0.01,
          signals: [{ signal: 'keyword', rank: index + 1, score: 1, weight: 1, contribution: 1 }],
        })),
      ),
  };
}

function fragmentSource(text: string): FragmentSource {
  return {
    get: (ref) => Promise.resolve(ref === BIG_REF ? { ref, text, kind: 'code' } : undefined),
  };
}

describe('context compiler — citation-preserving compression (FR-31)', () => {
  it('compresses an over-budget top fragment instead of dropping it, preserving its citation', async () => {
    const compiler = createContextCompiler({
      retriever: fakeRetriever([BIG_REF]),
      fragmentSource: fragmentSource(BIG_TEXT),
    });
    const budget = 25; // well under the fragment's full size, forcing an excerpt

    const pkg = await compiler.compile({
      task: 'retry policy exponential backoff',
      budget,
    });
    const fragment = pkg.sections
      .flatMap((section) => section.fragments)
      .find((f) => f.ref === BIG_REF);

    // Salvaged (not dropped), within budget, citation intact, compression surfaced, relevant line kept.
    expect(fragment).toBeDefined();
    expect(pkg.totalTokens).toBeLessThanOrEqual(budget);
    expect(fragment?.provenance.signals).toContain('keyword');
    expect(fragment?.whyIncluded).toMatch(/compressed to fit budget \(\d+→\d+ tokens\)/);
    expect(fragment?.text).toContain('exponential backoff');
    expect(fragment?.text).not.toContain('changelog');
    expect(fragment?.tokens).toBe(estimateTokens(fragment?.text ?? ''));

    const compress = pkg.trace.stages.find((stage) => stage.stage === 'compress');
    expect(compress?.notes).toMatch(/compressed 1 fragment/);
    expect(compress?.dropped).toHaveLength(0);
  });
});
