import type { Candidate, RetrievalQuery, RetrieverKind } from '../domain.js';

/**
 * The common retriever interface (ARCHITECTURE §8). Each strategy — semantic, keyword, graph,
 * symbolic (and temporal in R1) — implements it, returning candidates **ordered best-first**, each
 * tagged with the retriever's `kind`, honoring `query.limit`. The fusion ranker combines several.
 */
export interface Retriever {
  readonly kind: RetrieverKind;
  retrieve(query: RetrievalQuery): Promise<readonly Candidate[]>;
}
