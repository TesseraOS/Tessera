import type { GraphNode, GraphStore } from '@tessera/knowledge-graph';
import { DEFAULT_RETRIEVAL_LIMIT, type Candidate } from '../domain.js';
import type { Retriever } from '../ports/retriever.js';
import { extractTerms } from '../util/text.js';

export interface GraphRetrieverOptions {
  readonly graphStore: GraphStore;
  /** Max seed nodes matched lexically before expansion (default 5). */
  readonly maxSeeds?: number;
  /** Max effect-link hops to expand from each seed (defaults to the store's default). */
  readonly maxDepth?: number;
}

function matchesTerms(node: GraphNode, terms: readonly string[]): boolean {
  const haystack = `${node.key} ${node.label}`.toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

/**
 * Graph retriever (FR-23): finds seed nodes whose key/label matches the query terms, then **expands
 * via effect-links** (`get_effects`) to surface dependents. Seeds score 1; expanded nodes inherit
 * the traversal score (< 1), so direct matches rank above their downstream effects.
 */
export function createGraphRetriever(options: GraphRetrieverOptions): Retriever {
  const maxSeeds = options.maxSeeds ?? 5;
  const effectOptions = options.maxDepth === undefined ? undefined : { maxDepth: options.maxDepth };

  return {
    kind: 'graph',
    async retrieve(query) {
      const limit = query.limit ?? DEFAULT_RETRIEVAL_LIMIT;
      const terms = extractTerms(query.text);
      if (terms.length === 0) return [];

      const nodes = await options.graphStore.listNodes();
      const seeds = nodes.filter((node) => matchesTerms(node, terms)).slice(0, maxSeeds);

      const best = new Map<string, Candidate>();
      const consider = (ref: string, score: number, label: string): void => {
        const current = best.get(ref);
        if (current === undefined || score > current.score) {
          best.set(ref, { ref, signal: 'graph', score, label });
        }
      };

      for (const seed of seeds) {
        consider(seed.id, 1, seed.label);
        for (const hit of await options.graphStore.getEffects(seed.id, effectOptions)) {
          consider(hit.nodeId, hit.score, hit.node.label);
        }
      }

      return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
    },
    forTenant(tenantId) {
      return createGraphRetriever({
        ...options,
        graphStore: options.graphStore.forTenant(tenantId),
      });
    },
    forProject(projectId) {
      return createGraphRetriever({
        ...options,
        graphStore: options.graphStore.forProject(projectId),
      });
    },
  };
}
