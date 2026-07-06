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
export type RegisterSourceRequest = paths['/v1/sources']['post']['requestBody']['content'][Json];
export type Source = paths['/v1/sources']['post']['responses'][201]['content'][Json];
export type SourceList = paths['/v1/sources']['get']['responses'][200]['content'][Json];
export type ScanResult = paths['/v1/sources/{id}/scan']['post']['responses'][200]['content'][Json];
export type ScanStatus = paths['/v1/sources/{id}/scan']['get']['responses'][200]['content'][Json];

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
  /** List the registered ingestion sources. */
  listSources(): Promise<SourceList>;
  /** Register a filesystem/git source for ingestion. */
  registerSource(request: RegisterSourceRequest): Promise<Source>;
  /** Get a registered source (throws `NOT_FOUND` if absent). */
  getSource(id: string): Promise<Source>;
  /** Remove a registered source. */
  removeSource(id: string): Promise<{ id: string }>;
  /** Scan a source (incremental + idempotent); returns what changed. */
  scanSource(id: string): Promise<ScanResult>;
  /** A source's most recent scan status. */
  scanStatus(id: string): Promise<ScanStatus>;
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
    async scanStatus(id) {
      return unwrap(await client.GET('/v1/sources/{id}/scan', { params: { path: { id } } }));
    },
  };
}
