import type { Embeddings } from '@tessera/ai';
import type {
  ApiEventMap,
  ApiServices,
  AuditLog,
  AuditMetadata,
  NotificationStore,
} from '@tessera/api';
import {
  createLocalAuthProvider,
  createOidcAuthProvider,
  createTokenAuthProvider,
  type TokenStore,
} from '@tessera/api/auth';
import { createProjectService, type ProjectStore } from '@tessera/api/projects';
import {
  createDodoBilling,
  createLocalBilling,
  type BillingProvider,
  type SubscriptionStore,
  type UsageStore,
} from '@tessera/billing';
import { createContextCompiler } from '@tessera/context-compiler';
import {
  createEventBus,
  createStaticFlagProvider,
  DEFAULT_PROJECT_ID,
  DEFAULT_TENANT_ID,
  ValidationError,
  type PrincipalRef,
  type TenantId,
} from '@tessera/core';
import { createPluginHost, type PluginHealthSummary } from '@tessera/plugin-host';
import {
  createGraphExtractionSink,
  createIngestionWorker,
  createMemoryExtractionSink,
  createSourceService,
  defaultMemoryExtractors,
  documentIdFor,
  teeSink,
  type IngestionEvents,
  type IngestionManifest,
  type SourceRegistry,
} from '@tessera/ingestion';
import { createKnowledgeGraphService, type GraphStore } from '@tessera/knowledge-graph';
import {
  createMemoryService,
  type MemoryKind,
  type MemoryRetentionPolicy,
  type MemoryRetentionRule,
  type MemoryStore,
} from '@tessera/memory';
import {
  createGraphRetriever,
  createHybridRetriever,
  createSemanticRetriever,
  createSymbolicRetriever,
  type KeywordRetriever,
  type TemporalRetriever,
} from '@tessera/retrieval';
import type { BlobStore, Queue, RelationalStore, VectorStore } from '@tessera/storage';
import { createBlobFragmentSource } from '../fragment-source.js';
import { createCorpusIndexer } from '../sources/corpus-indexer.js';
import { migrateCorpusToScopedKeys } from '../sources/corpus-migration.js';
import { createIndexingDocumentSink } from '../sources/ingestion-sink.js';
import { createIndexingMemoryService } from '../sources/memory-indexing.js';
import { createEnrichedRetriever } from '../sources/search-enrichment.js';
import { createTreeSitterSymbolExtractor } from '../symbols/tree-sitter-extractor.js';
import { connectorForRecord } from './connectors.js';
import type { Runtime, RuntimeAuth } from '../runtime.js';
import type { TesseraConfig } from '../schema.js';
import type { SecretsProvider } from '../secrets/index.js';

/**
 * The **profile-independent** half of the composition root (F-056, ADR-0059 §1).
 *
 * Everything here is identical for every deployment profile: services are built out of ports, and a
 * port does not know which adapter satisfies it. Only {@link ProfileAdapters} — the eleven
 * constructions plus lifecycle — differs between Local and self-hosted, which is precisely the
 * FR-53 claim that a profile is a *selection*, not a code path.
 *
 * The alternative was one `createRuntime` with a branch at each construction site. Thirteen branches
 * through 200 lines of wiring is how two profiles quietly diverge in what they compose, rather than
 * in what they select.
 */

/** The adapters a profile constructs. Everything else is assembled from these. */
export interface ProfileAdapters {
  readonly relational: RelationalStore;
  readonly blob: BlobStore;
  readonly queue: Queue;
  readonly vector: VectorStore;
  readonly embeddings: Embeddings;
  readonly graphStore: GraphStore;
  readonly memoryStore: MemoryStore;
  readonly keyword: KeywordRetriever;
  readonly temporal: TemporalRetriever;
  readonly manifest: IngestionManifest;
  readonly registry: SourceRegistry;
  readonly projectStore: ProjectStore;
  /**
   * Durable per-tenant usage buckets (F-057; NFR-12) and subscription state (closing the F-030
   * in-memory seam). **Required from both profiles, deliberately** — an optional member here, or one
   * constructed below in the profile-independent half, is exactly how a store ends up SQLite-only and
   * caps self-hosted at a single node (the F-056 lesson). Making them required is what forces the
   * compiler to ask Local *and* self-hosted for an answer.
   */
  readonly usageStore: UsageStore;
  readonly subscriptionStore: SubscriptionStore;
  /**
   * Per-principal notification read state + preferences (F-065). **Required from both profiles**,
   * for the reason stated above: cross-device read state is the whole point of F-065, so a
   * self-hosted deployment left without it would ship the exact defect the feature exists to fix.
   */
  readonly notificationStore: NotificationStore;
  /** Present when `config.auth.mode === 'token'`; the profile picks the backing store. */
  readonly tokenStore?: TokenStore;
  /** Present when `config.audit.enabled`. */
  readonly auditLog?: AuditLog;
  /** Named for the readiness probe (`sqlite`, `postgres`) so `/ready` says which store it checked. */
  readonly relationalName: string;
  /** Profile-specific teardown, run after the shared teardown. */
  close(): Promise<void>;
}

export interface AssembleOptions {
  readonly secrets: SecretsProvider;
}

/**
 * Record a background scan's outcome in the audit trail (F-065), attributed to the principal that
 * started it. A no-op when auditing is disabled or the scan was unattributed — see the subscribers
 * in `assembleRuntime` for why an unattributed row is not written.
 *
 * Best-effort and failure-isolated: the ingestion pipeline must not fail because a sink did.
 */
function recordScanOutcome(
  auditLog: AuditLog | undefined,
  action: 'source.scan.completed' | 'source.scan.failed',
  tenantId: TenantId,
  sourceId: string,
  actor: PrincipalRef | undefined,
  metadata?: AuditMetadata,
): void {
  if (auditLog === undefined || actor === undefined) return;
  void auditLog
    .forTenant(tenantId)
    .record({
      tenantId,
      actor,
      action,
      target: sourceId,
      outcome: 'success',
      // Omitted rather than empty: `{}` would serialize into every failure row and read as "we
      // measured nothing" instead of "there is nothing to measure".
      ...(metadata !== undefined ? { metadata } : {}),
    })
    .catch(() => {
      // Swallowed by design, exactly as the boundary recorder does: a trail write must never break
      // the pipeline that triggered it.
    });
}

/**
 * Build the runtime auth from config (F-034). `token` mode requires the profile to have supplied a
 * {@link TokenStore} — which store backs it is the profile's choice, and the only thing that changes
 * between them.
 */
function createRuntimeAuth(config: TesseraConfig['auth'], tokenStore?: TokenStore): RuntimeAuth {
  if (config.mode === 'token') {
    if (tokenStore === undefined) {
      throw new ValidationError('auth.mode "token" requires a token store from the profile');
    }
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
 * and persists subscriptions in the store the **profile** supplied; otherwise the local/free adapter
 * (OSS default, no external service).
 *
 * The store arrives as an argument rather than being constructed here, and that is the whole fix for
 * the F-030 seam: this function lives in the profile-independent half, which by construction cannot
 * know whether the durable store is SQLite or Postgres. Building an in-memory `Map` here meant that on
 * Managed Cloud a restart — or simply a second replica — silently downgraded every paying tenant to
 * free, because nothing outside one process had ever heard about the subscription.
 */
async function createRuntimeBilling(
  config: TesseraConfig['billing'],
  secrets: SecretsProvider,
  store: SubscriptionStore,
): Promise<BillingProvider> {
  if (config.provider === 'dodo') {
    const [apiKey, webhookSecret] = await Promise.all([
      secrets.require('BILLING_DODO_API_KEY'),
      secrets.require('BILLING_DODO_WEBHOOK_SECRET'),
    ]);
    return createDodoBilling({
      apiKey,
      webhookSecret,
      store,
      ...(config.dodoBaseUrl !== undefined ? { baseUrl: config.dodoBaseUrl } : {}),
    });
  }
  return createLocalBilling();
}

/**
 * The `detail` string `/ready` shows for the plugin host (F-058; ADR-0061 §3).
 *
 * The empty case says **"0 plugins registered"** rather than "healthy". Every profile Tessera ships
 * today is in that case, and an operator reading `plugins: ok` needs to be able to tell "nothing is
 * broken" from "nothing is loaded" — the aggregate alone cannot distinguish them, because an empty
 * set is vacuously healthy.
 */
function describePluginHealth(health: PluginHealthSummary): string {
  const total = health.plugins.length;
  if (total === 0) return '0 plugins registered';
  const unhealthy = health.plugins.filter((plugin) => !plugin.ok).map((plugin) => plugin.id);
  return unhealthy.length === 0
    ? `${String(total)} registered, all healthy`
    : `${String(total)} registered; unhealthy: ${unhealthy.join(', ')}`;
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

/** Compose a {@link Runtime} from a profile's adapters. Identical for every profile, by construction. */
export async function assembleRuntime(
  config: TesseraConfig,
  adapters: ProfileAdapters,
  options: AssembleOptions,
): Promise<Runtime> {
  const { secrets } = options;
  const { relational, blob, queue, vector, embeddings, keyword, temporal, manifest } = adapters;

  // Corpus keys carry their (tenant, project) since F-075/ADR-0067. A pre-F-075 corpus is unreadable
  // under the new layout, so it is migrated HERE — before a single service exists, let alone a served
  // request. Zero-auth deployments resolve every request to `config.auth.tenant`, so that is where
  // their existing blobs belong; anything else predates multi-tenant ingestion and belongs to the
  // default tenant. Marker-guarded, so this is one `exists()` on every boot after the first.
  await migrateCorpusToScopedKeys(blob, {
    tenantId: config.auth.mode === 'none' ? config.auth.tenant : DEFAULT_TENANT_ID,
    projectId: DEFAULT_PROJECT_ID,
  });

  const graph = createKnowledgeGraphService(adapters.graphStore);

  const search = createHybridRetriever([
    createSemanticRetriever({ embeddings, vectorStore: vector }),
    keyword,
    createGraphRetriever({ graphStore: adapters.graphStore }),
    createSymbolicRetriever({ graphStore: adapters.graphStore }),
    temporal,
  ]);

  // The corpus read path, shared by the compiler's resolve stage and search enrichment (F-061) —
  // one blob-backed source, so a snippet and a compiled fragment can never disagree about a ref.
  const fragmentSource = createBlobFragmentSource(blob);

  const compiler = createContextCompiler({
    retriever: search,
    fragmentSource,
    graphStore: adapters.graphStore,
  });

  // What REST + MCP expose for search (F-061/F-073): labels, kinds, graph nodes, opt-in snippets.
  // The COMPILER deliberately keeps the raw `search` — it resolves fragments itself in its own stage,
  // so enriching its retriever would buy nothing and pay for a second corpus read per candidate.
  const enrichedSearch = createEnrichedRetriever(search, fragmentSource);

  const billing = await createRuntimeBilling(config.billing, secrets, adapters.subscriptionStore);
  const memory = createMemoryService(adapters.memoryStore);

  // --- Runtime ingestion (F-038): registry + pipeline worker + SSE bridge -------------------------
  const events = createEventBus<ApiEventMap>();
  const ingestionEvents = createEventBus<IngestionEvents>();
  // Tenant attribution for the bridged SSE events (ADR-0050, closed by ADR-0057) — the SSE route
  // delivers an event only to the tenant named here. Every scan-attributable event carries its owning
  // tenant: `source.scan.*` from the registry record, `document.*` from the scope F-071 threads onto
  // the queue job. (SSE has no project dimension — `ApiEventMap` is tenant-scoped — so only
  // `scope.tenantId` is bridged; within-tenant project isolation on the stream is a documented
  // backlog item, ADR-0057 §consequences.)
  const bridge = [
    ingestionEvents.on('document.ingested', ({ document, scope }) =>
      events.emit('document.ingested', {
        tenantId: scope.tenantId,
        ref: document.id,
        path: document.path,
        kind: document.kind,
      }),
    ),
    ingestionEvents.on('document.removed', ({ sourceId, path, scope }) =>
      events.emit('document.removed', {
        tenantId: scope.tenantId,
        ref: documentIdFor(sourceId, path),
        path,
      }),
    ),
    ingestionEvents.on('source.scan.started', (event) =>
      events.emit('source.scan.started', {
        sourceId: event.sourceId,
        tenantId: event.tenantId,
        kind: event.kind,
        label: event.label,
        total: event.total,
      }),
    ),
    // Scan progress + failure (F-081): the scan runs in the background, so these are the only way a
    // client learns how far it has got or that it died. Field-by-field like the rest — the ingestion
    // payloads are domain events, and re-emitting them wholesale would put whatever they gain next
    // straight onto the wire.
    ingestionEvents.on('source.scan.progress', (event) =>
      events.emit('source.scan.progress', {
        sourceId: event.sourceId,
        tenantId: event.tenantId,
        kind: event.kind,
        label: event.label,
        processed: event.processed,
        total: event.total,
      }),
    ),
    ingestionEvents.on('source.scan.failed', (event) =>
      events.emit('source.scan.failed', {
        sourceId: event.sourceId,
        tenantId: event.tenantId,
        kind: event.kind,
        label: event.label,
        error: event.error,
      }),
    ),
    ingestionEvents.on('source.scan.completed', (event) =>
      events.emit('source.scan.completed', {
        sourceId: event.sourceId,
        tenantId: event.tenantId,
        kind: event.kind,
        label: event.label,
        summary: event.summary,
      }),
    ),
    // Usage metering for ingested documents (F-057; NFR-12, ADR-0060 §5). A subscriber here rather
    // than a marker on `POST /v1/sources/:id/scan`, because that route has returned **202 accepted**
    // since F-081: documents are written later by the queue worker. Metering the request would count
    // intent, not documents — and a scan that finds nothing would bill the same as one that ingests a
    // thousand files. Failure-isolated, like every other recorder.
    // `durationMs: 0` is deliberate and not a placeholder: the event carries no timing, and the
    // surfaces report latency for `compile` and `search` only, so an invented number would be the
    // one thing worse than an absent one. Known limit, stated rather than hidden: the queue may retry
    // a handler, so a retried job can count its documents twice — exact-once accounting would need a
    // dedupe key the event does not carry.
    ingestionEvents.on('document.ingested', ({ scope }) => {
      void adapters.usageStore
        .record({
          tenantId: scope.tenantId,
          projectId: scope.projectId,
          operation: 'ingest',
          occurredAt: new Date().toISOString(),
          durationMs: 0,
        })
        .catch(() => {
          // Swallowed by design: a metering failure must never break the ingestion pipeline.
        });
    }),
    // Scan OUTCOMES into the audit trail (F-065). The `source.manage` row the boundary records means
    // "a scan was started" — since F-081 the request is answered before any work happens, so whether
    // it then succeeded or died was recorded nowhere. These two rows are what make `scan.completed` /
    // `scan.failed` derivable as notifications at all, and what lets a returning user or a
    // reconnecting agent ask "did my scan work?" from persisted state instead of a live stream.
    //
    // Attribution comes from the event, not from this process: `actor` is the principal the boundary
    // passed to `startScan`. Without one there is nobody to attribute the row to, and the trail's
    // whole contract is who-did-what — so an unattributed scan records nothing rather than inventing
    // a system actor. Failure-isolated, like the metering subscriber above.
    ingestionEvents.on('source.scan.completed', ({ tenantId, sourceId, actor, summary }) => {
      recordScanOutcome(adapters.auditLog, 'source.scan.completed', tenantId, sourceId, actor, {
        added: summary.added,
        modified: summary.modified,
        removed: summary.removed,
      });
    }),
    ingestionEvents.on('source.scan.failed', ({ tenantId, sourceId, actor }) => {
      // The error message is deliberately NOT carried into the trail: it originates in a connector
      // and can quote a path or a remote's response (NFR-7 — the trail holds no content). The
      // failure itself is the auditable fact; the detail stays in the source's status and the logs.
      recordScanOutcome(adapters.auditLog, 'source.scan.failed', tenantId, sourceId, actor);
    }),
  ];

  // The corpus indexer (F-039): one tenant-aware path that lands (ref, text) in the blob corpus AND
  // the keyword/temporal/semantic indices, so search/compile answer from the real repo. Shared by
  // ingestion (the DocumentSink) and memory capture (the MemoryService decorator) → one ref space.
  const indexer = createCorpusIndexer({ blob, keyword, temporal, embeddings, vector });
  const indexedMemory = createIndexingMemoryService(memory, indexer);
  // The runtime DocumentSink: index every document (F-039) + extract memories from ADRs/settled items
  // (F-017) + populate the knowledge graph from code symbols/imports (F-040). Scope-aware since
  // F-071/ADR-0057 — the worker resolves the scanning tenant/project from the queue job.
  const ingestionSink = teeSink(
    createIndexingDocumentSink(indexer),
    createMemoryExtractionSink({ memory: indexedMemory, extractors: defaultMemoryExtractors }),
    createGraphExtractionSink({ extractor: createTreeSitterSymbolExtractor(), graph }),
  );
  const sources = createSourceService({
    registry: adapters.registry,
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

  // The plugin host (F-058; FR-59/FR-60). Profile-independent: which extension points exist is a
  // product fact. It starts EMPTY — see `Runtime.plugins` for why nothing is registered yet — and
  // `/ready` reports that emptiness rather than dressing it up as health.
  const plugins = createPluginHost();

  const services: ApiServices = {
    search: enrichedSearch,
    compiler,
    graph,
    memory: indexedMemory,
    sources,
    // Multi-project workspaces (F-066, ADR-0037): persistent project catalog under the tenant.
    projects: createProjectService(adapters.projectStore),
    billing,
    readiness: async () => {
      const [ok, pluginHealth] = await Promise.all([
        relational.healthcheck().catch(() => false),
        plugins.health(),
      ]);
      const checks = [
        { name: adapters.relationalName, ok },
        { name: 'plugins', ok: pluginHealth.ok, detail: describePluginHealth(pluginHealth) },
      ];
      return { ready: checks.every((check) => check.ok), checks };
    },
  };

  return {
    config,
    services,
    auth: createRuntimeAuth(config.auth, adapters.tokenStore),
    billing,
    // Whether this deployment is METERED (ADR-0060 §1) — an explicit flag, never inferred from the
    // presence of a provider object, because the composition root always wires one.
    metered: config.billing.provider !== 'none',
    // Per-tenant usage metering (F-057). On the Runtime rather than in ApiServices, deliberately:
    // ApiServices is rebuilt member-by-member by `instrumentServices`, and a member dropped there
    // 500s its routes in production (E-015, twice). BuildServerOptions is structurally immune.
    usage: adapters.usageStore,
    // Feature flags (F-058; FR-57). Profile-independent by construction: a rollout rule is a product
    // decision, so the static adapter over config is built here rather than asked of each profile.
    flags: createStaticFlagProvider(config.flags.definitions),
    plugins,
    // Persistent audit trail (F-027) when enabled; the surface falls back to its in-memory sink otherwise.
    ...(adapters.auditLog !== undefined ? { audit: adapters.auditLog } : {}),
    // Cross-device notification read state + preferences (F-065). On the Runtime rather than in
    // ApiServices for the E-015 reason the usage store documents above.
    notifications: adapters.notificationStore,
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
      // Terminate the embedding worker threads (F-085) — without this the process cannot exit. No-op
      // for the in-process adapters, which do not implement `close`.
      await embeddings.close?.();
      await vector.close();
      await relational.close();
      // Anything the profile owns beyond the shared set (a Redis connection, an S3 client).
      await adapters.close();
    },
  };
}
