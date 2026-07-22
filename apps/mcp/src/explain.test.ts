import type { ContextPackage } from '@tessera/context-compiler';
import { describe, expect, it } from 'vitest';
import { buildExplanation } from './explain.js';

const pkg: ContextPackage = {
  task: 'how auth works',
  budget: 100,
  totalTokens: 42,
  sections: [
    {
      title: 'Code',
      fragments: [
        {
          ref: 'doc:auth',
          text: 'long body that explain() should not echo back',
          kind: 'markdown',
          tokens: 20,
          score: 1.2,
          provenance: { retrievalScore: 0.9, signals: ['keyword'], expandedFrom: 'doc:tokens' },
          whyIncluded: 'matched keyword "auth"; reached via effect-link from doc:tokens',
        },
      ],
    },
  ],
  trace: {
    stages: [
      { stage: 'retrieve', inputCount: 1, outputCount: 3, dropped: [] },
      {
        stage: 'dedup',
        inputCount: 3,
        outputCount: 2,
        dropped: [{ ref: 'doc:dup', reason: 'near-duplicate' }],
      },
    ],
  },
  scores: { fragmentCount: 1, budgetAdherence: 1, provenanceCoverage: 1, redundancy: 0 },
};

describe('buildExplanation', () => {
  it('projects provenance + trace without the fragment body', () => {
    const explanation = buildExplanation(pkg);

    expect(explanation).toMatchObject({ task: 'how auth works', budget: 100, totalTokens: 42 });
    expect(explanation.fragments).toHaveLength(1);

    const fragment = explanation.fragments[0];
    expect(fragment).toMatchObject({
      ref: 'doc:auth',
      kind: 'markdown',
      signals: ['keyword'],
      expandedFrom: 'doc:tokens',
    });
    expect(fragment?.whyIncluded).toContain('auth');
    expect(JSON.stringify(explanation)).not.toContain('should not echo');

    expect(explanation.trace.map((stage) => stage.stage)).toEqual(['retrieve', 'dedup']);
    expect(explanation.trace[1]?.dropped[0]).toEqual({ ref: 'doc:dup', reason: 'near-duplicate' });
  });

  it('omits expandedFrom when a fragment was not graph-expanded', () => {
    const direct: ContextPackage = {
      ...pkg,
      sections: [
        {
          title: 'Code',
          fragments: [
            {
              ref: 'doc:plain',
              text: 't',
              kind: 'markdown',
              tokens: 1,
              score: 1,
              provenance: { retrievalScore: 0.5, signals: ['semantic'] },
              whyIncluded: 'semantic match',
            },
          ],
        },
      ],
    };
    expect(buildExplanation(direct).fragments[0]).not.toHaveProperty('expandedFrom');
  });
});

describe('budgetClamp (F-077, ADR-0056)', () => {
  it('names the clamp when the requested budget exceeded the effective one', () => {
    // `pkg.budget` is 100 — the EFFECTIVE budget, because the caller clamps before compiling.
    expect(buildExplanation(pkg, { requestedBudget: 50_000 }).budgetClamp).toEqual({
      requested: 50_000,
      effective: 100,
    });
  });

  it('omits it when nothing was clamped, so the common case costs nothing', () => {
    expect(buildExplanation(pkg, { requestedBudget: 100 })).not.toHaveProperty('budgetClamp');
    expect(buildExplanation(pkg, { requestedBudget: 50 })).not.toHaveProperty('budgetClamp');
    expect(buildExplanation(pkg)).not.toHaveProperty('budgetClamp');
  });
});
