import type { Embeddings } from '@tessera/ai';
import type { VectorStore } from '@tessera/storage';
import { DEFAULT_RETRIEVAL_LIMIT, type Candidate } from '../domain.js';
import type { Retriever } from '../ports/retriever.js';

export interface SemanticRetrieverOptions {
  readonly embeddings: Embeddings;
  readonly vectorStore: VectorStore;
}

/**
 * Semantic retriever (FR-21): embeds the query and returns the nearest vectors from the
 * {@link VectorStore}. Candidates are ordered by ascending distance (nearest first); the local
 * score is `1/(1+distance)`.
 */
export function createSemanticRetriever(options: SemanticRetrieverOptions): Retriever {
  return {
    kind: 'semantic',
    async retrieve(query) {
      const limit = query.limit ?? DEFAULT_RETRIEVAL_LIMIT;
      const vector = await options.embeddings.embed(query.text);
      const matches = await options.vectorStore.query(vector, limit);
      return matches.map((match): Candidate => ({
        ref: match.id,
        signal: 'semantic',
        score: 1 / (1 + match.distance),
      }));
    },
  };
}
