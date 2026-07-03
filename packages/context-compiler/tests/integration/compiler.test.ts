import { afterEach, describe, expect, it } from 'vitest';
import { createContextCompiler } from '../../src/compiler';
import { buildCorpus, QUERY, type Corpus } from './corpus';

describe('context compiler pipeline', () => {
  let corpus: Corpus | undefined;
  afterEach(async () => {
    await corpus?.cleanup();
    corpus = undefined;
  });

  it('produces a budget-bounded, provenance-tagged, sectioned package with a full trace', async () => {
    const c = (corpus = await buildCorpus());
    const compiler = createContextCompiler({
      retriever: c.retriever,
      fragmentSource: c.fragmentSource,
      graphStore: c.graphStore,
    });

    const pkg = await compiler.compile({ task: QUERY, budget: 1000 });
    const fragments = pkg.sections.flatMap((section) => section.fragments);
    const refs = fragments.map((fragment) => fragment.ref);

    // Budget-bounded and explainable.
    expect(pkg.totalTokens).toBeLessThanOrEqual(1000);
    expect(pkg.totalTokens).toBe(fragments.reduce((sum, f) => sum + f.tokens, 0));
    expect(fragments.length).toBeGreaterThan(0);
    expect(fragments.every((f) => f.whyIncluded.length > 0)).toBe(true);
    expect(
      fragments.every((f) => f.provenance.signals.length > 0 || f.provenance.expandedFrom),
    ).toBe(true);

    // Relevant doc present; near-duplicate junk collapsed to one; effect-dependent pulled in.
    expect(refs).toContain(c.id('auth'));
    expect(refs).toContain(c.id('tokens'));
    const junkCount = refs.filter((r) => r === c.id('junk-1') || r === c.id('junk-2')).length;
    expect(junkCount).toBe(1);

    const tokensFragment = fragments.find((f) => f.ref === c.id('tokens'));
    expect(tokensFragment?.provenance.expandedFrom).toBe(c.id('auth'));

    // Full trace for the inspector, with a recorded dedup drop.
    expect(pkg.trace.stages.map((s) => s.stage)).toEqual([
      'plan',
      'retrieve',
      'expand',
      'rank',
      'resolve',
      'dedup',
      'compress',
      'assemble',
    ]);
    const dedup = pkg.trace.stages.find((s) => s.stage === 'dedup');
    expect(dedup?.dropped.length).toBe(1);
    // Each stage is timed for observability (F-016).
    expect(pkg.trace.stages.every((s) => typeof s.durationMs === 'number')).toBe(true);
  });

  it('scopes retrieval + graph expansion to the tenant (forTenant) — no cross-tenant fragments', async () => {
    const c = (corpus = await buildCorpus()); // the corpus is indexed under the DEFAULT tenant
    const compiler = createContextCompiler({
      retriever: c.retriever,
      fragmentSource: c.fragmentSource,
      graphStore: c.graphStore,
    });

    // The default tenant sees the corpus…
    const base = await compiler.compile({ task: QUERY, budget: 1000 });
    expect(base.sections.flatMap((s) => s.fragments).length).toBeGreaterThan(0);

    // …a different tenant's compiler sees an empty corpus (retrieval + graph are scoped away).
    const other = await compiler.forTenant('tenant-b').compile({ task: QUERY, budget: 1000 });
    expect(other.sections.flatMap((s) => s.fragments)).toHaveLength(0);
  });

  it('never exceeds a tight budget (graceful degradation)', async () => {
    const c = (corpus = await buildCorpus());
    const compiler = createContextCompiler({
      retriever: c.retriever,
      fragmentSource: c.fragmentSource,
      graphStore: c.graphStore,
    });

    const pkg = await compiler.compile({ task: QUERY, budget: 16 });
    expect(pkg.totalTokens).toBeLessThanOrEqual(16);
  });
});
