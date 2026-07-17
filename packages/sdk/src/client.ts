import createClient from 'openapi-fetch';
import type { paths } from './generated/schema.js';
import { parseErrorEnvelope, TesseraApiError } from './errors.js';

type Json = 'application/json';

/** Request/response types derived from the generated OpenAPI `paths` — never hand-maintained. */
export type SearchRequest = paths['/v1/search']['post']['requestBody']['content'][Json];
export type SearchResults = paths['/v1/search']['post']['responses'][200]['content'][Json];
export type CompileRequest = paths['/v1/compile']['post']['requestBody']['content'][Json];
export type ContextPackage = paths['/v1/compile']['post']['responses'][200]['content'][Json];
export type EffectsQuery = NonNullable<paths['/v1/effects']['get']['parameters']['query']>;
export type EffectsResult = paths['/v1/effects']['get']['responses'][200]['content'][Json];
export type GraphQuery = NonNullable<paths['/v1/graph']['get']['parameters']['query']>;
export type GraphSnapshot = paths['/v1/graph']['get']['responses'][200]['content'][Json];
export type AssertEffectRequest = paths['/v1/effects']['post']['requestBody']['content'][Json];
export type EffectLink = paths['/v1/effects']['post']['responses'][201]['content'][Json];
export type CaptureMemoryRequest = paths['/v1/memory']['post']['requestBody']['content'][Json];
export type EditMemoryRequest = NonNullable<
  paths['/v1/memory/{lineageId}']['patch']['requestBody']
>['content'][Json];
export type MemoryListQuery = NonNullable<paths['/v1/memory']['get']['parameters']['query']>;
export type MemoryList = paths['/v1/memory']['get']['responses'][200]['content'][Json];
export type Memory = paths['/v1/memory/{lineageId}']['get']['responses'][200]['content'][Json];
export type MemoryHistory =
  paths['/v1/memory/{lineageId}/history']['get']['responses'][200]['content'][Json];
export type AuditQuery = NonNullable<paths['/v1/audit']['get']['parameters']['query']>;
export type AuditPage = paths['/v1/audit']['get']['responses'][200]['content'][Json];
export type AuditExportQuery = NonNullable<paths['/v1/audit/export']['get']['parameters']['query']>;
export type AuditExport = paths['/v1/audit/export']['get']['responses'][200]['content'][Json];
export type RegisterSourceRequest = paths['/v1/sources']['post']['requestBody']['content'][Json];
export type Source = paths['/v1/sources']['post']['responses'][201]['content'][Json];
export type SourceList = paths['/v1/sources']['get']['responses'][200]['content'][Json];
/**
 * What `scanSource` resolves with: the scan was **accepted** and is running (202), not finished
 * (F-081). It carries no `summary` — a call that does not wait for the ingest has nothing truthful
 * to say about what changed. Read the result from {@link ScanStatus} (`lastScan`) or the
 * `source.scan.completed` event.
 */
export type ScanAccepted =
  paths['/v1/sources/{id}/scan']['post']['responses'][202]['content'][Json];
export type ScanStatus = paths['/v1/sources/{id}/scan']['get']['responses'][200]['content'][Json];
export type WorkspaceStats = paths['/v1/stats']['get']['responses'][200]['content'][Json];
export type ActivityQuery = NonNullable<paths['/v1/stats/activity']['get']['parameters']['query']>;
export type WorkspaceActivity =
  paths['/v1/stats/activity']['get']['responses'][200]['content'][Json];
export type Identity = paths['/v1/me']['get']['responses'][200]['content'][Json];
export type RbacCatalog = paths['/v1/rbac']['get']['responses'][200]['content'][Json];
export type TokenList = paths['/v1/tokens']['get']['responses'][200]['content'][Json];
export type CreateTokenRequest = paths['/v1/tokens']['post']['requestBody']['content'][Json];
export type CreatedToken = paths['/v1/tokens']['post']['responses'][201]['content'][Json];
export type RetentionPolicy = paths['/v1/retention']['get']['responses'][200]['content'][Json];
export type RetentionPruneResult =
  paths['/v1/retention/prune']['post']['responses'][200]['content'][Json];
export type DsrBundle = paths['/v1/dsr/export']['get']['responses'][200]['content'][Json];
export type DsrDeleteResult = paths['/v1/dsr/delete']['post']['responses'][200]['content'][Json];
export type Plans = paths['/v1/billing/plans']['get']['responses'][200]['content'][Json];
export type Subscription =
  paths['/v1/billing/subscription']['get']['responses'][200]['content'][Json];
export type HealthStatus = paths['/health']['get']['responses'][200]['content'][Json];
export type ReadyStatus = paths['/ready']['get']['responses'][200]['content'][Json];

export interface TesseraClientOptions {
  /** Base URL of the API, including the `/v1`-hosting origin (e.g. `http://localhost:3000`). */
  readonly baseUrl: string;
  /** `fetch` implementation (default: the global `fetch`). */
  readonly fetch?: typeof fetch;
  /** Extra headers applied to every request (e.g. an auth token — auth is R2). */
  readonly headers?: Record<string, string>;
}

/** A first-class, typed client for the Tessera `/v1` API, generated from its OpenAPI document (FR-39). */
export interface TesseraClient {
  /** The caller's resolved identity, tenant, and effective permissions (401 when unauthenticated). */
  me(): Promise<Identity>;
  /** The RBAC catalog: roles, permissions, and role → permissions. */
  getRbac(): Promise<RbacCatalog>;
  /** List the calling tenant's API tokens (no secrets; `admin:manage`). */
  listTokens(): Promise<TokenList>;
  /** Issue a scoped API token — the plaintext `secret` is returned once (`admin:manage`). */
  createToken(request: CreateTokenRequest): Promise<CreatedToken>;
  /** Revoke an API token by id (`admin:manage`). */
  revokeToken(id: string): Promise<{ id: string; revoked: true }>;
  /** Hybrid search across code, memory, and the knowledge graph. */
  search(request: SearchRequest): Promise<SearchResults>;
  /** Compile a provenance-tagged, budget-bounded Context Package for a task. */
  compile(request: CompileRequest): Promise<ContextPackage>;
  /** Ranked, path-bearing dependents of a node ("what breaks if this changes"). */
  getEffects(query: EffectsQuery): Promise<EffectsResult>;
  /** A bounded subgraph (nodes + edges) of the knowledge graph for visualization. */
  queryGraph(query?: GraphQuery): Promise<GraphSnapshot>;
  /** Manually assert an effect-link: changing `from` may require reviewing `to`. */
  assertEffect(request: AssertEffectRequest): Promise<EffectLink>;
  /** Capture a new memory (returns its first version). */
  captureMemory(request: CaptureMemoryRequest): Promise<Memory>;
  /** List the current memories, optionally filtered by kind/scope. */
  listMemories(query?: MemoryListQuery): Promise<MemoryList>;
  /** The current version of a memory lineage (throws `NOT_FOUND` if absent). */
  getMemory(lineageId: string): Promise<Memory>;
  /** Edit a memory (appends a superseding version). */
  editMemory(lineageId: string, patch: EditMemoryRequest): Promise<Memory>;
  /** Every version of a memory lineage, oldest first. */
  memoryHistory(lineageId: string): Promise<MemoryHistory>;
  /** Query this tenant's audit trail (admin only), newest-first + paginated. */
  getAudit(query?: AuditQuery): Promise<AuditPage>;
  /**
   * Every audit event matching `query` — the server follows the cursor to completeness, so this is
   * the whole filtered trail rather than a page of it (admin only). Returns **data, not bytes**:
   * formatting it as CSV/JSON is the caller's business. The export is itself audited (`audit.export`),
   * so it appears in the trail it exported. `truncated` is true when the row cap applied.
   */
  exportAudit(query?: AuditExportQuery): Promise<AuditExport>;
  /** The deployment's effective memory retention policy (admin only); empty rules ⇒ retention off. */
  getRetention(): Promise<RetentionPolicy>;
  /** Apply the retention policy to this tenant's memories (admin only); returns what was pruned. */
  pruneRetention(): Promise<RetentionPruneResult>;
  /** Export everything held for this tenant — memories, graph, sources, audit (admin only; NFR-13). */
  exportTenantData(): Promise<DsrBundle>;
  /** Erase this tenant's data plane; the audit trail is retained by design (admin only; NFR-13). */
  deleteTenantData(): Promise<DsrDeleteResult>;
  /** List the registered ingestion sources. */
  listSources(): Promise<SourceList>;
  /** Register a filesystem/git source for ingestion. */
  registerSource(request: RegisterSourceRequest): Promise<Source>;
  /** Get a registered source (throws `NOT_FOUND` if absent). */
  getSource(id: string): Promise<Source>;
  /** Remove a registered source. */
  removeSource(id: string): Promise<{ id: string }>;
  /**
   * Start a scan (incremental + idempotent). Returns as soon as it is **accepted** — the scan runs
   * in the background (F-081). Follow it with {@link TesseraClient.scanStatus} or the
   * `source.scan.progress` / `.completed` / `.failed` events. Rejects with `CONFLICT` if a scan of
   * this source is already running.
   */
  scanSource(id: string): Promise<ScanAccepted>;
  /**
   * The workspace summary: indexed documents, memories, graph nodes + effect-links, sources, and
   * when a source last completed a scan (F-060). Scoped to the caller's tenant.
   */
  getStats(): Promise<WorkspaceStats>;
  /**
   * Daily activity for the Overview chart (F-084) — audit-derived, floored to the trail. `from` is
   * the window the server actually used (clamped to the oldest event it holds), which the caller
   * must label; `points` is empty when the trail has no history.
   */
  getActivity(query?: ActivityQuery): Promise<WorkspaceActivity>;
  /** A source's most recent scan status. */
  scanStatus(id: string): Promise<ScanStatus>;
  /** The subscription plan catalog + entitlements (public). */
  getPlans(): Promise<Plans>;
  /** The calling tenant's current subscription (`admin:manage`). */
  getSubscription(): Promise<Subscription>;
  /** Liveness — `GET /health`. */
  getHealth(): Promise<HealthStatus>;
  /**
   * Readiness + dependency checks — `GET /ready`. Returns the readiness body for both `200` (ready)
   * and `503` (not ready) — a `503` here is a **status to render**, not a client error.
   */
  getReady(): Promise<ReadyStatus>;
}

/** Unwrap an openapi-fetch result: return the body on success, else throw a typed error. */
function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.response.ok && result.data !== undefined) return result.data;
  throw new TesseraApiError(result.response.status, parseErrorEnvelope(result.error));
}

/**
 * Create a {@link TesseraClient} over the generated types (openapi-fetch). Every method is typed by the
 * OpenAPI contract; non-2xx responses surface as {@link TesseraApiError} with the envelope's `code`.
 * This supersedes the interim hand-written `apps/web/lib/api` (ADR-0022) once the web app adopts it.
 */
export function createTesseraClient(options: TesseraClientOptions): TesseraClient {
  const client = createClient<paths>({
    baseUrl: options.baseUrl,
    ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
    ...(options.headers !== undefined ? { headers: options.headers } : {}),
  });

  return {
    async me() {
      return unwrap(await client.GET('/v1/me', {}));
    },
    async getRbac() {
      return unwrap(await client.GET('/v1/rbac', {}));
    },
    async listTokens() {
      return unwrap(await client.GET('/v1/tokens', {}));
    },
    async createToken(request) {
      return unwrap(await client.POST('/v1/tokens', { body: request }));
    },
    async revokeToken(id) {
      return unwrap(await client.DELETE('/v1/tokens/{id}', { params: { path: { id } } }));
    },
    async search(request) {
      return unwrap(await client.POST('/v1/search', { body: request }));
    },
    async compile(request) {
      return unwrap(await client.POST('/v1/compile', { body: request }));
    },
    async getEffects(query) {
      return unwrap(await client.GET('/v1/effects', { params: { query } }));
    },
    async queryGraph(query = {}) {
      return unwrap(await client.GET('/v1/graph', { params: { query } }));
    },
    async assertEffect(request) {
      return unwrap(await client.POST('/v1/effects', { body: request }));
    },
    async captureMemory(request) {
      return unwrap(await client.POST('/v1/memory', { body: request }));
    },
    async listMemories(query = {}) {
      return unwrap(await client.GET('/v1/memory', { params: { query } }));
    },
    async getMemory(lineageId) {
      return unwrap(
        await client.GET('/v1/memory/{lineageId}', { params: { path: { lineageId } } }),
      );
    },
    async editMemory(lineageId, patch) {
      return unwrap(
        await client.PATCH('/v1/memory/{lineageId}', {
          params: { path: { lineageId } },
          body: patch,
        }),
      );
    },
    async memoryHistory(lineageId) {
      return unwrap(
        await client.GET('/v1/memory/{lineageId}/history', { params: { path: { lineageId } } }),
      );
    },
    async getAudit(query = {}) {
      return unwrap(await client.GET('/v1/audit', { params: { query } }));
    },
    async exportAudit(query = {}) {
      return unwrap(await client.GET('/v1/audit/export', { params: { query } }));
    },
    async getRetention() {
      return unwrap(await client.GET('/v1/retention', {}));
    },
    async pruneRetention() {
      return unwrap(await client.POST('/v1/retention/prune', {}));
    },
    async exportTenantData() {
      return unwrap(await client.GET('/v1/dsr/export', {}));
    },
    async deleteTenantData() {
      return unwrap(await client.POST('/v1/dsr/delete', {}));
    },
    async listSources() {
      return unwrap(await client.GET('/v1/sources', {}));
    },
    async registerSource(request) {
      return unwrap(await client.POST('/v1/sources', { body: request }));
    },
    async getSource(id) {
      return unwrap(await client.GET('/v1/sources/{id}', { params: { path: { id } } }));
    },
    async removeSource(id) {
      return unwrap(await client.DELETE('/v1/sources/{id}', { params: { path: { id } } }));
    },
    async scanSource(id) {
      return unwrap(await client.POST('/v1/sources/{id}/scan', { params: { path: { id } } }));
    },
    async getStats() {
      return unwrap(await client.GET('/v1/stats', {}));
    },
    async getActivity(query) {
      return unwrap(
        await client.GET('/v1/stats/activity', query !== undefined ? { params: { query } } : {}),
      );
    },
    async scanStatus(id) {
      return unwrap(await client.GET('/v1/sources/{id}/scan', { params: { path: { id } } }));
    },
    async getPlans() {
      return unwrap(await client.GET('/v1/billing/plans', {}));
    },
    async getSubscription() {
      return unwrap(await client.GET('/v1/billing/subscription', {}));
    },
    async getHealth() {
      return unwrap(await client.GET('/health', {}));
    },
    async getReady() {
      // `/ready` answers 503 (with a valid readiness body) when a dependency is down — that body is a
      // status to render, not an error. openapi-fetch surfaces the 200 body as `data` and the 503 body
      // as `error`; return whichever is present.
      const result = await client.GET('/ready', {});
      const body = result.data ?? (result.error as ReadyStatus | undefined);
      if (body === undefined) {
        throw new TesseraApiError(result.response.status, parseErrorEnvelope(result.error));
      }
      return body;
    },
  };
}
