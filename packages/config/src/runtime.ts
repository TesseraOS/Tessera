import type { Embeddings } from '@tessera/ai';
// `ApiEventBus`/`ApiEventMap` are imported TYPE-ONLY (the bus is built via `@tessera/core`) so
// `@tessera/config` — and the MCP process booting through it — stays Fastify-free (ADR-0030).
import type { ApiEventBus, ApiServices, AuditLog } from '@tessera/api';
import type { AuthProvider, TokenStore } from '@tessera/api/auth';
import type { BillingProvider } from '@tessera/billing';
import type { SourceService } from '@tessera/ingestion';
import type { KeywordRetriever, TemporalRetriever } from '@tessera/retrieval';
import type { BlobStore, Queue, SqliteStore, VectorStore } from '@tessera/storage';
import type { TesseraConfig } from './schema.js';
import type { SecretsProvider } from './secrets/index.js';

/** The wired low-level stores a runtime owns. */
export interface RuntimeStores {
  readonly relational: SqliteStore;
  readonly vector: VectorStore;
  readonly blob: BlobStore;
  readonly queue: Queue;
}

/**
 * The auth wiring a runtime exposes (F-034): the {@link AuthProvider} the REST/MCP surfaces guard with
 * (selected by `config.auth.mode`), plus the {@link TokenStore} when `mode: token` (so an admin/CLI can
 * issue + revoke tokens). In `none` mode the provider is the zero-auth Local provider and there is no
 * token store.
 */
export interface RuntimeAuth {
  readonly provider: AuthProvider;
  readonly tokenStore?: TokenStore;
}

/**
 * A fully-wired Tessera runtime for a deployment profile: the validated config, the composed
 * {@link ApiServices} the REST/MCP surfaces consume, the secrets provider, and the underlying
 * adapters. `close()` releases handles.
 */
export interface Runtime {
  readonly config: TesseraConfig;
  /** The domain services the REST (F-011) and MCP (F-012) surfaces take by injection. */
  readonly services: ApiServices;
  /** The auth provider (+ token store) the surfaces guard with, selected by `config.auth` (F-034). */
  readonly auth: RuntimeAuth;
  /** The billing provider (local/free or Dodo), selected by `config.billing` (F-030). */
  readonly billing: BillingProvider;
  /**
   * The persistent, tenant-scoped audit trail (F-027; FR-55/NFR-13) the REST surface records into,
   * present when `config.audit.enabled`. `undefined` → the surface falls back to its in-memory sink.
   */
  readonly audit?: AuditLog;
  /**
   * Runtime source management (F-038; FR-62): register/scan filesystem+git sources through the
   * ingestion pipeline. The same instance is exposed on {@link ApiServices.sources} for REST/MCP.
   */
  readonly sources: SourceService;
  /**
   * The shared SSE event bus (F-021/F-038). Producers — the memory-capture route and the ingestion
   * worker (bridged here) — emit onto it; `GET /v1/events` streams it. `apps/server` passes this to
   * `buildServer` so the runtime's ingestion events reach connected clients.
   */
  readonly events: ApiEventBus;
  readonly secrets: SecretsProvider;
  readonly stores: RuntimeStores;
  readonly embeddings: Embeddings;
  /** The keyword retriever, exposed so ingestion/tests can index content into its FTS table. */
  readonly keyword: KeywordRetriever;
  /** The temporal retriever, exposed so ingestion/tests can index item timestamps (FR-24). */
  readonly temporal: TemporalRetriever;
  /** Release underlying handles (drain the queue, close the SQLite databases). */
  close(): Promise<void>;
}
