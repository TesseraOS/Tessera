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

const DECOY = 'a decoy body that belongs to nobody in this test';

describe('the compiler resolves fragments through its own scope (ADR-0067)', () => {
  // Three scopes, and the DECOYS are load-bearing. With content under `acme/default` alone, every
  // negative below is satisfied by the other scopes being empty — so they stayed green when the
  // compiler stopped rebinding `fragmentSource` (an evaluator pass caught exactly that). With a
  // decoy under the base scope and under `acme/beta`, an unrebound view returns the WRONG body
  // instead of no body, and the assertions go red.
  const fragmentSource = scopedFragmentSource(
    new Map([
      ['acme/default', new Map([[REF, { ref: REF, text: TEXT, kind: 'code' }]])],
      ['default/default', new Map([[REF, { ref: REF, text: DECOY, kind: 'code' }]])],
      ['acme/beta', new Map([[REF, { ref: REF, text: DECOY, kind: 'code' }]])],
    ]),
  );
  const compiler = createContextCompiler({ retriever, fragmentSource });

  it('the owning tenant gets ITS body, not the base scope decoy', async () => {
    const pkg = await compiler.forTenant('acme').compile({ task: 'rounding rule', budget: 500 });

    const fragments = pkg.sections.flatMap((section) => section.fragments);
    expect(fragments.map((f) => f.ref)).toEqual([REF]);
    expect(fragments[0]?.text).toContain('half-even');
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

  it('another PROJECT within the owning tenant reads ITS corpus, never the default project"s', async () => {
    const pkg = await compiler
      .forTenant('acme')
      .forProject('beta')
      .compile({ task: 'rounding rule', budget: 500 });

    // Asserted as "gets the beta content" rather than "gets nothing": beta genuinely holds a
    // fragment here, so a `forProject` that failed to rebind would surface acme/default's real body
    // and this goes red. An empty-beta fixture would have passed either way.
    const text = pkg.sections.flatMap((section) => section.fragments).map((f) => f.text);
    expect(text).toEqual([DECOY]);
    expect(text.join()).not.toContain('half-even');
  });
});
