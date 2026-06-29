import { describe, expect, it } from 'vitest';
import type { ContextPackage, PackageScores } from './domain.js';
import { computeContextQuality } from './quality.js';

function pkg(refs: readonly string[], scores: PackageScores): ContextPackage {
  return {
    task: 'task',
    budget: 100,
    sections: [
      {
        title: 'Context',
        fragments: refs.map((ref) => ({
          ref,
          text: '',
          kind: 'text',
          tokens: 1,
          score: 1,
          provenance: { retrievalScore: 1, signals: ['keyword'] },
          whyIncluded: '',
        })),
      },
    ],
    totalTokens: refs.length,
    trace: { stages: [] },
    scores,
  };
}

const cleanScores = (count: number): PackageScores => ({
  fragmentCount: count,
  budgetAdherence: 1,
  provenanceCoverage: 1,
  redundancy: 0,
});

describe('computeContextQuality', () => {
  it('rewards including the relevant refs without padding (relevance F1)', () => {
    const relevant = new Set(['a', 'b']);

    const perfect = computeContextQuality(pkg(['a', 'b'], cleanScores(2)), { relevant });
    const padded = computeContextQuality(pkg(['a', 'b', 'x', 'y'], cleanScores(4)), { relevant });

    expect(perfect.relevance).toBe(1);
    expect(padded.relevance).toBeLessThan(perfect.relevance);
    expect(perfect.overall).toBeGreaterThan(padded.overall);
  });

  it('penalizes redundancy and missing provenance', () => {
    const relevant = new Set(['a', 'b']);
    const labels = { relevant };

    const clean = computeContextQuality(pkg(['a', 'b'], cleanScores(2)), labels);
    const noisy = computeContextQuality(
      pkg(['a', 'b'], {
        fragmentCount: 2,
        budgetAdherence: 1,
        provenanceCoverage: 0,
        redundancy: 1,
      }),
      labels,
    );

    expect(clean.overall).toBeGreaterThan(noisy.overall);
  });
});
