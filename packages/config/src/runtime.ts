import type { Embeddings } from '@tessera/ai';
// `ApiEventBus`/`ApiEventMap` are imported TYPE-ONLY (the bus is built via `@tessera/core`) so
// `@tessera/config` — and the MCP process booting through it — stays Fastify-free (ADR-0030).
import type { ApiEventBus, ApiServices, AuditLog } from '@tessera/api';
import type { AuthProvider, TokenStore } from '@tessera/api/auth';
import type { BillingProvider, UsageStore } from '@tessera/billing';
import type { FlagProvider } from '@tessera/core';
import type { SourceService } from '@tessera/ingestion';
import type { MemoryRetentionPolicy } from '@tessera/memory';
import type { KeywordRetriever, TemporalRetriever } from '@tessera/retrieval';
import type { BlobStore, Queue, RelationalStore, VectorStore } from '@tessera/storage';
import type { TesseraConfig } from './schema.js';
import type { SecretsProvider } from './secrets/index.js';

/**
 * The wired low-level stores a runtime owns.
 *
 * `relational` is the **port**, not a dialect: the Local profile supplies `SqliteStore` and the
 * self-hosted profile `PostgresStore` (F-056). Narrowing this to one dialect is what made
 * `createLocalRuntime` the only profile that could exist — everything downstream needs the lifecycle
 * (`healthcheck`/`close`), and the typed Drizzle handle belongs to whoever constructs the adapters.
 */
export interface RuntimeStores {
  readonly relational: RelationalStore;
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
   * Whether this deployment is **metered** — `config.billing.provider !== 'none'` (ADR-0060 §1).
   *
   * The surfaces read this rather than testing `billing !== undefined`, because a provider object is
   * always present: `createRuntimeBilling` falls back to the local/free adapter, which reports every
   * tenant as free. Inferring meterage from its presence capped every Local and self-hosted
   * deployment at the cloud free tier's 8000 tokens per compile — the exact outcome ADR-0056 §3
   * decided against and believed it had prevented.
   */
  readonly metered: boolean;
  /**
   * Durable per-tenant usage buckets (F-057; NFR-12) — what the metering recorders write to, what the
   * monthly compile entitlement is measured against, and what `GET /v1/usage` and the Analytics view
   * read. Always present: the profile supplies it, so there is no "metering is off" runtime shape.
   */
  readonly usage: UsageStore;
  /**
   * Feature flags (F-058; FR-57), evaluated per tenant at the API boundary. Always present — the
   * static adapter over `config.flags.definitions`, which is an empty catalog by default, so there is
   * no "flags are off" runtime shape to branch on. A remote provider swaps in behind the same port.
   */
  readonly flags: FlagProvider;
  /**
   * The persistent, tenant-scoped audit trail (F-027; FR-55/NFR-13) the REST surface records into,
   * present when `config.audit.enabled`. `undefined` → the surface falls back to its in-memory sink.
   */
  readonly audit?: AuditLog;
  /**
   * The resolved memory retention policy (FR-15; from `config.memory.retention`, days → ms). Empty by
   * default (retention off). `apps/server` passes it to `buildServer` so `POST /v1/retention/prune`
   * applies it; a scheduler running the pass periodically is a documented seam.
   */
  readonly memoryRetention: MemoryRetentionPolicy;
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
