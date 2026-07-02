import {
  createFakeEmbeddings,
  createOllamaEmbeddings,
  createTransformersEmbeddings,
  type Embeddings,
} from '@tessera/ai';
import type { ApiServices } from '@tessera/api';
import { createContextCompiler } from '@tessera/context-compiler';
import { InternalError, ValidationError } from '@tessera/core';
import { createKnowledgeGraphService, createSqliteGraphStore } from '@tessera/knowledge-graph';
import { createMemoryService, createSqliteMemoryStore } from '@tessera/memory';
import {
  createGraphRetriever,
  createHybridRetriever,
  createKeywordRetriever,
  createSemanticRetriever,
  createSymbolicRetriever,
  createTemporalRetriever,
} from '@tessera/retrieval';
import {
  createFilesystemBlobStore,
  createInProcessQueue,
  createSqliteStore,
  createSqliteVecStore,
} from '@tessera/storage';
import { createBlobFragmentSource } from '../fragment-source.js';
import type { Env } from '../load.js';
import type { Runtime } from '../runtime.js';
import type { TesseraConfig } from '../schema.js';
import { createSecretsProvider } from '../secrets/index.js';

/** Construct the configured embeddings provider. Transformers/Ollama load a model (async). */
async function createEmbeddings(config: TesseraConfig['embeddings']): Promise<Embeddings> {
  switch (config.provider) {
    case 'fake':
      return createFakeEmbeddings(
        config.dimension !== undefined ? { dimension: config.dimension } : {},
      );
    case 'ollama':
      if (config.model === undefined) {
        throw new ValidationError('embeddings.model is required for the "ollama" provider');
      }
      return createOllamaEmbeddings({
        model: config.model,
        ...(config.ollamaUrl !== undefined ? { baseUrl: config.ollamaUrl } : {}),
      });
    case 'transformers':
    default:
      return createTransformersEmbeddings(
        config.model !== undefined ? { model: config.model } : {},
      );
  }
}

export interface LocalRuntimeOptions {
  /** Environment used by the env secrets provider (default `process.env`). */
  readonly env?: Env;
}

/**
 * Wire the **Local** deployment profile (FR-50): SQLite (relational) + sqlite-vec (vector) +
 * filesystem (blob) + in-process queue + Transformers.js embeddings, composed into the
 * {@link ApiServices} the REST/MCP surfaces consume — **zero external services or keys**. The
 * embedding dimension is taken from the constructed provider so the vector store always matches.
 */
export async function createLocalRuntime(
  config: TesseraConfig,
  options: LocalRuntimeOptions = {},
): Promise<Runtime> {
  if (config.profile !== 'local') {
    throw new InternalError(
      `deployment profile "${config.profile}" is not wired yet (self-hosted/cloud: F-023)`,
    );
  }

  const secrets = createSecretsProvider(config.secrets, options.env ?? process.env);

  const relational = createSqliteStore({ path: config.storage.sqlitePath });
  await relational.migrate();
  const blob = createFilesystemBlobStore({ root: config.storage.blobRoot });
  const queue = createInProcessQueue();

  const embeddings = await createEmbeddings(config.embeddings);
  const vector = createSqliteVecStore({
    path: config.storage.vectorPath,
    dimension: embeddings.info.dimension,
  });

  const graphStore = createSqliteGraphStore(relational.db);
  const memoryStore = createSqliteMemoryStore(relational.db);

  const keyword = createKeywordRetriever({ db: relational.db });
  const temporal = createTemporalRetriever({ db: relational.db });
  const search = createHybridRetriever([
    createSemanticRetriever({ embeddings, vectorStore: vector }),
    keyword,
    createGraphRetriever({ graphStore }),
    createSymbolicRetriever({ graphStore }),
    temporal,
  ]);

  const compiler = createContextCompiler({
    retriever: search,
    fragmentSource: createBlobFragmentSource(blob),
    graphStore,
  });

  const services: ApiServices = {
    search,
    compiler,
    graph: createKnowledgeGraphService(graphStore),
    memory: createMemoryService(memoryStore),
    readiness: async () => {
      const ok = await relational.healthcheck().catch(() => false);
      const checks = [{ name: 'sqlite', ok }];
      return { ready: checks.every((check) => check.ok), checks };
    },
  };

  return {
    config,
    services,
    secrets,
    stores: { relational, vector, blob, queue },
    embeddings,
    keyword,
    temporal,
    async close() {
      await queue.shutdown();
      await vector.close();
      await relational.close();
    },
  };
}
