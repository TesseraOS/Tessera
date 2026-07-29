import { describe, expect, it } from 'vitest';
import { createContextCompiler } from '../../src/compiler';
import type { HybridRetriever } from '@tessera/retrieval';
import { scopedFragmentSource } from './scoped-corpus';

const REF = 'a'.repeat(64);
const TEXT = 'settlement runs on the half-even rounding rule';

/**
 * A retriever that returns the same ref for EVERY scope — deliberately unscoped.
 *
 * That is the point: it removes retrieval from the experiment, so the only thing that can keep one
 * tenant's body away from another is the corpus itself. With a scoped retriever these assertions
 * would pass whether or not `forTenant` rebound the fragment source, which is exactly how the gap
 * ADR-0067 closes went unnoticed.
 */
const retriever: HybridRetriever = {
  search: () =>
    Promise.resolve([
      {
        ref: REF,
        score: 1,
        signals: [{ signal: 'keyword', rank: 1, score: 1, weight: 1, contribution: 1 }],
      },
    ]),
  forTenant: () => retriever,
  forProject: () => retriever,
};

describe('the compiler resolves fragments through its own scope (ADR-0067)', () => {
  const fragmentSource = scopedFragmentSource(
    new Map([[REF, { ref: REF, text: TEXT, kind: 'code' }]]),
    {
      tenantId: 'acme',
      projectId: 'default',
    },
  );
  const compiler = createContextCompiler({ retriever, fragmentSource });

  it('the owning tenant gets the body', async () => {
    const pkg = await compiler.forTenant('acme').compile({ task: 'rounding rule', budget: 500 });

    expect(pkg.sections.flatMap((section) => section.fragments).map((f) => f.ref)).toEqual([REF]);
  });

  it('another tenant compiling the SAME ref gets no content, and the compiler says so', async () => {
    const pkg = await compiler.forTenant('globex').compile({ task: 'rounding rule', budget: 500 });

    expect(pkg.sections.flatMap((section) => section.fragments)).toHaveLength(0);
    // Dropped by RESOLVE specifically, and traced — not silently missing, and not lost earlier in
    // the pipeline. Asserting the ref appears anywhere in the trace would pass on the retrieve
    // stage alone, which happens whether or not the corpus is scoped.
    const resolve = pkg.trace.stages.find((stage) => stage.stage === 'resolve');
    expect(resolve?.dropped.map((drop) => drop.ref)).toEqual([REF]);
  });

  it('another PROJECT within the owning tenant also gets no content', async () => {
    const pkg = await compiler
      .forTenant('acme')
      .forProject('beta')
      .compile({ task: 'rounding rule', budget: 500 });

    expect(pkg.sections.flatMap((section) => section.fragments)).toHaveLength(0);
  });
});
