import type { ApiServices } from '@tessera/api';
import { createContextCompiler, type FragmentSource } from '@tessera/context-compiler';
import { ValidationError } from '@tessera/core';
import {
  createFilesystemConnector,
  createGitConnector,
  createInMemoryDocumentSink,
  createInMemoryManifest,
  createInMemorySourceRegistry,
  createIngestionWorker,
  createSourceService,
  type Connector,
  type SourceRecord,
  type SourceService,
} from '@tessera/ingestion';
import { createInMemoryProjectStore, createProjectService } from '@tessera/api/projects';
import { createInMemoryGraphStore, createKnowledgeGraphService } from '@tessera/knowledge-graph';
import { createInMemoryMemoryStore, createMemoryService } from '@tessera/memory';
import { createHybridRetriever, type Candidate, type Retriever } from '@tessera/retrieval';
import { createInProcessQueue } from '@tessera/storage';

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
  // The fixed test corpus is scope-agnostic; scoping is a no-op here (FR-52/FR-66 isolation is covered
  // by the tenant/project-aware stores + the api cross-tenant/cross-project e2e).
  forTenant() {
    return keywordRetriever;
  },
  forProject() {
    return keywordRetriever;
  },
};

const fragmentSource: FragmentSource = {
  get(ref) {
    const doc = CORPUS[ref];
    return Promise.resolve(doc === undefined ? undefined : { ref, text: doc.text, kind: doc.kind });
  },
};

/** A real {@link SourceService} over in-memory adapters + real filesystem/git connectors (F-038). */
function createInMemorySourceService(): SourceService {
  const queue = createInProcessQueue();
  const manifest = createInMemoryManifest();
  const sink = createInMemoryDocumentSink();
  const sources = createSourceService({
    registry: createInMemorySourceRegistry(),
    queue,
    manifest,
    connectorFactory: (record: SourceRecord): Connector => {
      const root = record.config['root'];
      if (typeof root !== 'string' || root.length === 0) {
        throw new ValidationError('source config.root is required');
      }
      if (record.kind === 'filesystem') return createFilesystemConnector({ root });
      if (record.kind === 'git') return createGitConnector({ root });
      throw new ValidationError(`unsupported source kind "${record.kind}"`);
    },
  });
  createIngestionWorker({
    queue,
    connectors: [],
    connectorFor: sources.connectorFor,
    sink,
    manifest,
  });
  return sources;
}

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

  return {
    search,
    compiler,
    graph,
    memory,
    sources: createInMemorySourceService(),
    projects: createProjectService(createInMemoryProjectStore()),
  };
}
