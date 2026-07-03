import {
  createFakeEmbeddings,
  createOllamaEmbeddings,
  createTransformersEmbeddings,
  type Embeddings,
} from '@tessera/ai';
import type { ApiServices } from '@tessera/api';
// Runtime import via the Fastify-free `@tessera/api/auth` subpath (ADR-0030) — so the composition root
// (and the MCP process that boots through it) never pulls Fastify.
import { createLocalAuthProvider, createTokenAuthProvider } from '@tessera/api/auth';
import {
  createDodoBilling,
  createInMemorySubscriptionStore,
  createLocalBilling,
  type BillingProvider,
} from '@tessera/billing';
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
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { createSqliteTokenStore } from '../auth/sqlite-token-store.js';
import { createBlobFragmentSource } from '../fragment-source.js';
import type { Env } from '../load.js';
import type { Runtime, RuntimeAuth } from '../runtime.js';
import type { TesseraConfig } from '../schema.js';
import { createSecretsProvider, type SecretsProvider } from '../secrets/index.js';

/**
 * Build the runtime auth from config (F-034): `token` mode wires a persistent SQLite token store behind
 * the token provider; `none` mode is the zero-auth Local provider (full access in the configured tenant).
 */
function createRuntimeAuth(config: TesseraConfig['auth'], db: BetterSQLite3Database): RuntimeAuth {
  if (config.mode === 'token') {
    const tokenStore = createSqliteTokenStore(db);
    return { provider: createTokenAuthProvider({ tokenStore }), tokenStore };
  }
  return { provider: createLocalAuthProvider({ tenantId: config.tenant }) };
}

/**
 * Build the billing provider from config (F-030): `dodo` reads its secrets via the SecretsProvider
 * and persists subscriptions in memory (a durable store is a seam); otherwise the local/free adapter
 * (OSS default, no external service).
 */
async function createRuntimeBilling(
  config: TesseraConfig['billing'],
  secrets: SecretsProvider,
): Promise<BillingProvider> {
  if (config.provider === 'dodo') {
    const [apiKey, webhookSecret] = await Promise.all([
      secrets.require('BILLING_DODO_API_KEY'),
      secrets.require('BILLING_DODO_WEBHOOK_SECRET'),
    ]);
    return createDodoBilling({
      apiKey,
      webhookSecret,
      store: createInMemorySubscriptionStore(),
      ...(config.dodoBaseUrl !== undefined ? { baseUrl: config.dodoBaseUrl } : {}),
    });
  }
  return createLocalBilling();
}

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

  const billing = await createRuntimeBilling(config.billing, secrets);

  const services: ApiServices = {
    search,
    compiler,
    graph: createKnowledgeGraphService(graphStore),
    memory: createMemoryService(memoryStore),
    billing,
    readiness: async () => {
      const ok = await relational.healthcheck().catch(() => false);
      const checks = [{ name: 'sqlite', ok }];
      return { ready: checks.every((check) => check.ok), checks };
    },
  };

  return {
    config,
    services,
    auth: createRuntimeAuth(config.auth, relational.db),
    billing,
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
