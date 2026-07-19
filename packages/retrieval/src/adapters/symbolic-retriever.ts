import type { GraphStore } from '@tessera/knowledge-graph';
import { DEFAULT_RETRIEVAL_LIMIT, type Candidate } from '../domain.js';
import type { Retriever } from '../ports/retriever.js';
import { extractTerms } from '../util/text.js';

export interface SymbolicRetrieverOptions {
  readonly graphStore: GraphStore;
}

const EXACT_SCORE = 1;
const PARTIAL_SCORE = 0.5;

/**
 * Symbolic retriever (FR-25): exact (and prefix/suffix) lookup of `symbol` nodes by name. An exact
 * key/label match scores 1; a prefix/suffix match scores 0.5. Backed by the knowledge graph's
 * symbol nodes.
 */
export function createSymbolicRetriever(options: SymbolicRetrieverOptions): Retriever {
  return {
    kind: 'symbolic',
    async retrieve(query) {
      const limit = query.limit ?? DEFAULT_RETRIEVAL_LIMIT;
      const terms = extractTerms(query.text);
      if (terms.length === 0) return [];

      const symbols = await options.graphStore.listNodes({ kind: 'symbol' });
      const candidates: Candidate[] = [];
      for (const node of symbols) {
        const key = node.key.toLowerCase();
        const label = node.label.toLowerCase();
        let score = 0;
        if (terms.includes(key) || terms.includes(label)) {
          score = EXACT_SCORE;
        } else if (terms.some((term) => key.startsWith(term) || key.endsWith(term))) {
          score = PARTIAL_SCORE;
        }
        if (score > 0)
          candidates.push({ ref: node.id, signal: 'symbolic', score, label: node.label });
      }

      return candidates.sort((a, b) => b.score - a.score).slice(0, limit);
    },
    forTenant(tenantId) {
      return createSymbolicRetriever({ graphStore: options.graphStore.forTenant(tenantId) });
    },
    forProject(projectId) {
      return createSymbolicRetriever({ graphStore: options.graphStore.forProject(projectId) });
    },
  };
}
