import {
  createFakeEmbeddings,
  createOllamaEmbeddings,
  createTransformersEmbeddings,
  type Embeddings,
} from '@tessera/ai';
// `ApiEventMap` is imported TYPE-ONLY (the bus is built via `@tessera/core`) so config stays Fastify-free.
import type { ApiEventMap, ApiServices } from '@tessera/api';
// Runtime import via the Fastify-free `@tessera/api/auth` subpath (ADR-0030) — so the composition root
// (and the MCP process that boots through it) never pulls Fastify.
import {
  createLocalAuthProvider,
  createOidcAuthProvider,
  createTokenAuthProvider,
} from '@tessera/api/auth';
import {
  createDodoBilling,
  createInMemorySubscriptionStore,
  createLocalBilling,
  type BillingProvider,
} from '@tessera/billing';
import { createContextCompiler } from '@tessera/context-compiler';
import { createEventBus, InternalError, ValidationError } from '@tessera/core';
import {
  createFilesystemConnector,
  createGitConnector,
  createGraphExtractionSink,
  createIngestionWorker,
  createMemoryExtractionSink,
  createSourceService,
  defaultMemoryExtractors,
  documentIdFor,
  teeSink,
  type Connector,
  type IngestionEvents,
  type SourceRecord,
} from '@tessera/ingestion';
import { createKnowledgeGraphService, createSqliteGraphStore } from '@tessera/knowledge-graph';
import {
  createMemoryService,
  createSqliteMemoryStore,
  type MemoryKind,
  type MemoryRetentionPolicy,
  type MemoryRetentionRule,
} from '@tessera/memory';
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
import { createSqliteAuditLog } from '../audit/sqlite-audit-log.js';
import { createBlobFragmentSource } from '../fragment-source.js';
import { createCorpusIndexer } from '../sources/corpus-indexer.js';
import { createIndexingDocumentSink } from '../sources/ingestion-sink.js';
import { createIndexingMemoryService } from '../sources/memory-indexing.js';
import { createSqliteManifest } from '../sources/sqlite-manifest.js';
import { createSqliteSourceRegistry } from '../sources/sqlite-source-registry.js';
import { createTreeSitterSymbolExtractor } from '../symbols/tree-sitter-extractor.js';
import type { Env } from '../load.js';
import type { Runtime, RuntimeAuth } from '../runtime.js';
import type { TesseraConfig } from '../schema.js';
import { createSecretsProvider, type SecretsProvider } from '../secrets/index.js';

/** The connector kinds the Local profile can build a source from (FR-6/FR-7). */
export const SUPPORTED_SOURCE_KINDS = ['filesystem', 'git'] as const;

/** Build the connector for a registered source; throws for an unsupported kind or a missing root. */
function connectorForRecord(record: SourceRecord): Connector {
  const root = record.config['root'];
  if (typeof root !== 'string' || root.length === 0) {
    throw new ValidationError('source config.root must be a non-empty string', {
      details: { kind: record.kind },
    });
  }
  switch (record.kind) {
    case 'filesystem':
      return createFilesystemConnector({ root });
    case 'git':
      return createGitConnector({ root });
    default:
      throw new ValidationError(`unsupported source kind "${record.kind}"`, {
        details: { kind: record.kind, supported: SUPPORTED_SOURCE_KINDS },
      });
  }
}

/**
 * Build the runtime auth from config (F-034): `token` mode wires a persistent SQLite token store behind
 * the token provider; `none` mode is the zero-auth Local provider (full access in the configured tenant).
 */
function createRuntimeAuth(config: TesseraConfig['auth'], db: BetterSQLite3Database): RuntimeAuth {
  if (config.mode === 'token') {
    const tokenStore = createSqliteTokenStore(db);
    return { provider: createTokenAuthProvider({ tokenStore }), tokenStore };
  }
  if (config.mode === 'oidc') {
    const { issuer, audience, jwksUri, rolesClaim, tenantClaim } = config.oidc;
    if (issuer === undefined || audience === undefined) {
      throw new ValidationError(
        'auth.oidc.issuer and auth.oidc.audience are required for mode "oidc"',
      );
    }
    return {
      provider: createOidcAuthProvider({
        issuer,
        audience,
        ...(jwksUri !== undefined ? { jwksUri } : {}),
        ...(rolesClaim !== undefined ? { rolesClaim } : {}),
        ...(tenantClaim !== undefined ? { tenantClaim } : {}),
      }),
    };
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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Resolve `config.memory.retention` (days) into the ms-based {@link MemoryRetentionPolicy} (FR-15). */
function toMemoryRetentionPolicy(
  retention: TesseraConfig['memory']['retention'],
): MemoryRetentionPolicy {
  const rules = retention.rules.map((rule): MemoryRetentionRule => {
    const resolved: {
      -readonly [K in keyof MemoryRetentionRule]?: MemoryRetentionRule[K];
    } = {};
    if (rule.kind !== undefined) resolved.kind = rule.kind as MemoryKind;
    if (rule.scope !== undefined) resolved.scope = rule.scope;
    if (rule.maxAgeDays !== undefined) resolved.maxAgeMs = rule.maxAgeDays * MS_PER_DAY;
    if (rule.maxSupersededVersions !== undefined)
      resolved.maxSupersededVersions = rule.maxSupersededVersions;
    if (rule.maxSupersededAgeDays !== undefined)
      resolved.maxSupersededAgeMs = rule.maxSupersededAgeDays * MS_PER_DAY;
    return resolved;
  });
  return { rules };
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
  const graph = createKnowledgeGraphService(graphStore);
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
  const memory = createMemoryService(memoryStore);

  // --- Runtime ingestion (F-038): registry + pipeline worker + SSE bridge ---------------------------
  // The shared SSE bus (built via @tessera/core so config stays Fastify-free) producers emit onto.
  const events = createEventBus<ApiEventMap>();
  // The ingestion domain bus the worker (document.*) + source service (source.scan.*) emit onto; bridged
  // to the SSE bus below as small, non-sensitive summaries.
  const ingestionEvents = createEventBus<IngestionEvents>();
  const bridge = [
    ingestionEvents.on('document.ingested', ({ document }) =>
      events.emit('document.ingested', {
        ref: document.id,
        path: document.path,
        kind: document.kind,
      }),
    ),
    ingestionEvents.on('document.removed', ({ sourceId, path }) =>
      events.emit('document.removed', { ref: documentIdFor(sourceId, path), path }),
    ),
    ingestionEvents.on('source.scan.started', (event) => events.emit('source.scan.started', event)),
    ingestionEvents.on('source.scan.completed', (event) =>
      events.emit('source.scan.completed', {
        sourceId: event.sourceId,
        kind: event.kind,
        label: event.label,
        summary: event.summary,
      }),
    ),
  ];

  // The manifest is shared by the coordinator (via the source service) and the worker (FR-8).
  const manifest = createSqliteManifest(relational.db);
  // The corpus indexer (F-039): one tenant-aware path that lands (ref, text) in the blob corpus AND the
  // keyword/temporal/semantic indices, so search/compile answer from the real repo. Shared by ingestion
  // (the DocumentSink) and memory capture (the MemoryService decorator) → one ref space.
  const indexer = createCorpusIndexer({ blob, keyword, temporal, embeddings, vector });
  // Indexed memory service: API/MCP captures + auto-extracted memories both become findable (F-039).
  const indexedMemory = createIndexingMemoryService(memory, indexer);
  // The runtime DocumentSink: index every document (F-039) + extract memories from ADRs/settled items
  // (F-017) + populate the knowledge graph from code symbols/imports (F-040), so get_effects returns
  // real dependents. Ingestion runs in the default tenant (F-038/ADR-0040 boundary).
  const ingestionSink = teeSink(
    createIndexingDocumentSink(indexer),
    createMemoryExtractionSink({ memory: indexedMemory, extractors: defaultMemoryExtractors }),
    createGraphExtractionSink({ extractor: createTreeSitterSymbolExtractor(), graph }),
  );
  const sources = createSourceService({
    registry: createSqliteSourceRegistry(relational.db),
    queue,
    manifest,
    connectorFactory: connectorForRecord,
    events: ingestionEvents,
    autoScanOnRegister: config.sources.autoScanOnRegister,
  });
  const worker = createIngestionWorker({
    queue,
    connectors: [],
    connectorFor: sources.connectorFor,
    sink: ingestionSink,
    manifest,
    events: ingestionEvents,
  });

  const services: ApiServices = {
    search,
    compiler,
    graph,
    memory: indexedMemory,
    sources,
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
    // Persistent audit trail (F-027) when enabled; the surface falls back to its in-memory sink otherwise.
    ...(config.audit.enabled ? { audit: createSqliteAuditLog(relational.db) } : {}),
    // Memory retention policy (F-047; FR-15) resolved from config; empty ⇒ retention off.
    memoryRetention: toMemoryRetentionPolicy(config.memory.retention),
    sources,
    events,
    secrets,
    stores: { relational, vector, blob, queue },
    embeddings,
    keyword,
    temporal,
    async close() {
      // Stop the worker + SSE bridge before draining the queue so no new work is scheduled.
      worker.subscription.unsubscribe();
      for (const off of bridge) off();
      await queue.shutdown();
      await vector.close();
      await relational.close();
    },
  };
}
