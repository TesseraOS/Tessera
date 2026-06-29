import { createSqliteStore } from '@tessera/storage';
import {
  createInMemoryGraphStore,
  createKnowledgeGraphService,
  nodeIdFor,
  type GraphStore,
} from '@tessera/knowledge-graph';
import {
  createHybridRetriever,
  createKeywordRetriever,
  type HybridRetriever,
} from '@tessera/retrieval';
import type { FragmentSource, SourceFragment } from '../../src/ports/fragment-source';

interface Doc {
  readonly key: string;
  readonly text: string;
  readonly kind: string;
}

// A small labeled corpus. The query matches `auth` and the identical `junk-*` pair; `tokens` is
// relevant but reachable only via the effect-link from `auth` (keyword misses it). The duplicate is
// among the *irrelevant* junk, so dedup helps without removing a relevant fragment.
const DOCS: readonly Doc[] = [
  {
    key: 'auth',
    text: 'user authentication and oauth login flow with bearer tokens',
    kind: 'code',
  },
  {
    key: 'junk-1',
    text: 'login screen styling and css for the oauth button widget',
    kind: 'markdown',
  },
  {
    key: 'junk-2',
    text: 'login screen styling and css for the oauth button widget',
    kind: 'markdown',
  },
  { key: 'tokens', text: 'persists refresh credentials to the database store layer', kind: 'code' },
];

export const QUERY = 'authentication oauth login';

export interface Corpus {
  readonly retriever: HybridRetriever;
  readonly fragmentSource: FragmentSource;
  readonly graphStore: GraphStore;
  readonly id: (key: string) => string;
  readonly relevant: ReadonlySet<string>;
  readonly cleanup: () => Promise<void>;
}

/** Build the labeled corpus: a keyword retriever, fragment source, and graph wired on a shared ref space. */
export async function buildCorpus(): Promise<Corpus> {
  const id = (key: string): string => nodeIdFor('file', key);
  const sqlite = createSqliteStore({ path: ':memory:' });
  const keyword = createKeywordRetriever({ db: sqlite.db });
  const graphStore = createInMemoryGraphStore();
  const service = createKnowledgeGraphService(graphStore);
  const fragments = new Map<string, SourceFragment>();

  for (const doc of DOCS) {
    const ref = id(doc.key);
    keyword.index(ref, doc.text);
    fragments.set(ref, { ref, text: doc.text, kind: doc.kind });
    await service.upsertNode({ kind: 'file', key: doc.key, label: doc.key });
  }
  // tokens.ts imports auth → static effect-link auth -> tokens (changing auth affects tokens).
  await service.upsertEdge({
    from: { kind: 'file', key: 'tokens' },
    to: { kind: 'file', key: 'auth' },
    kind: 'imports',
  });
  await service.deriveStaticEffectLinks();

  return {
    retriever: createHybridRetriever([keyword]),
    fragmentSource: { get: (ref) => Promise.resolve(fragments.get(ref)) },
    graphStore,
    id,
    relevant: new Set([id('auth'), id('tokens')]),
    cleanup: () => sqlite.close(),
  };
}
