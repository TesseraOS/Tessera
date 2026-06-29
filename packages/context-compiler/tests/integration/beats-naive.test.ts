import { afterEach, describe, expect, it } from 'vitest';
import { createContextCompiler } from '../../src/compiler';
import { computeContextQuality, naiveTopKPackage } from '../../src/quality';
import { buildCorpus, QUERY, type Corpus } from './corpus';

describe('context quality vs naive top-k RAG', () => {
  let corpus: Corpus | undefined;
  afterEach(async () => {
    await corpus?.cleanup();
    corpus = undefined;
  });

  it('the compiler beats naive top-k on the Context Quality Score', async () => {
    const c = (corpus = await buildCorpus());
    const request = { task: QUERY, budget: 1000 };
    const labels = { relevant: c.relevant };

    const compiled = await createContextCompiler({
      retriever: c.retriever,
      fragmentSource: c.fragmentSource,
      graphStore: c.graphStore,
    }).compile(request);
    const naive = await naiveTopKPackage(c.retriever, request, c.fragmentSource, 4);

    const compiledScore = computeContextQuality(compiled, labels);
    const naiveScore = computeContextQuality(naive, labels);

    expect(compiledScore.overall).toBeGreaterThan(naiveScore.overall);
    // It wins on the dimensions the compiler is designed to improve:
    expect(compiledScore.relevance).toBeGreaterThan(naiveScore.relevance); // expand reaches a missed relevant doc
    expect(compiledScore.redundancy).toBeLessThan(naiveScore.redundancy); // dedup removes near-duplicates
    expect(compiledScore.provenanceCoverage).toBeGreaterThan(naiveScore.provenanceCoverage);
  });
});
