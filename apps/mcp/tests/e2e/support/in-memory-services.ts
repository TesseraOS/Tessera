import type { ApiServices } from '@tessera/api';
import { createContextCompiler, type FragmentSource } from '@tessera/context-compiler';
import { createInMemoryGraphStore, createKnowledgeGraphService } from '@tessera/knowledge-graph';
import { createInMemoryMemoryStore, createMemoryService } from '@tessera/memory';
import { createHybridRetriever, type Candidate, type Retriever } from '@tessera/retrieval';

/**
 * E2E composition root: real domain services (F-007…F-010) over in-memory adapters + a small fixed
 * corpus. Test support only — the production local profile (validated config, SQLite+sqlite-vec+
 * filesystem+Transformers.js) is F-015. The MCP server is driven through a real SDK client.
 */

export const EFFECT_SOURCE = { kind: 'file', key: 'src/core.ts' } as const;
export const EFFECT_DEPENDENT_KEY = 'src/app.ts';

const CORPUS: Record<string, { readonly text: string; readonly kind: string }> = {
  'doc:auth': {
    text: 'Authentication uses signed tokens to verify the caller identity on every request.',
    kind: 'markdown',
  },
  'doc:tokens': {
    text: 'Tokens are issued at login and expire; refresh tokens renew a session without re-login.',
    kind: 'markdown',
  },
  'doc:storage': {
    text: 'Storage adapters persist data through the relational store port and a blob store.',
    kind: 'markdown',
  },
};

function tokenize(text: string): readonly string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

const keywordRetriever: Retriever = {
  kind: 'keyword',
  retrieve(query) {
    const queryTerms = new Set(tokenize(query.text));
    const limit = query.limit ?? 10;
    const scored: Candidate[] = Object.entries(CORPUS)
      .map(([ref, doc]): Candidate => {
        const overlap = tokenize(doc.text).filter((term) => queryTerms.has(term)).length;
        return { ref, signal: 'keyword', score: overlap, label: doc.text.slice(0, 48) };
      })
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return Promise.resolve(scored);
  },
  // The fixed test corpus is tenant-agnostic; scoping is a no-op here (FR-52 isolation is covered by
  // the tenant-aware stores + the api cross-tenant e2e).
  forTenant() {
    return keywordRetriever;
  },
};

const fragmentSource: FragmentSource = {
  get(ref) {
    const doc = CORPUS[ref];
    return Promise.resolve(doc === undefined ? undefined : { ref, text: doc.text, kind: doc.kind });
  },
};

/** Build the in-memory {@link ApiServices}, seeding a graph effect-link for `get_effects`. */
export async function createInMemoryServices(): Promise<ApiServices> {
  const memory = createMemoryService(createInMemoryMemoryStore());

  const graphStore = createInMemoryGraphStore();
  const graph = createKnowledgeGraphService(graphStore);
  await graph.upsertNode({ kind: 'file', key: EFFECT_SOURCE.key, label: 'core' });
  await graph.upsertNode({ kind: 'file', key: EFFECT_DEPENDENT_KEY, label: 'app' });
  await graph.assertEffectLink({
    from: { kind: 'file', key: EFFECT_SOURCE.key },
    to: { kind: 'file', key: EFFECT_DEPENDENT_KEY },
    rationale: 'app depends on core',
  });

  const search = createHybridRetriever([keywordRetriever]);
  const compiler = createContextCompiler({ retriever: search, fragmentSource, graphStore });

  return { search, compiler, graph, memory };
}
