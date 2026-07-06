import type {
  AuditPage,
  AuditQuery,
  CaptureMemoryBody,
  CompileBody,
  ContextPackage,
  EditMemoryBody,
  EffectsQuery,
  EffectsResponse,
  ErrorCode,
  ErrorEnvelope,
  GraphQuery,
  GraphSnapshot,
  HealthStatus,
  Memory,
  MemoryHistoryResponse,
  MemoryListFilter,
  MemoryListResponse,
  PlansResponse,
  ReadyStatus,
  RegisterSourceBody,
  ScanResult,
  ScanStatus,
  SearchBody,
  SearchResponse,
  Source,
  SourceListResponse,
} from './types';

/** Base URL of the Tessera REST API. Configurable; defaults to the Local profile (F-032). */
const BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/v1').replace(
  /\/$/,
  '',
);

/** Origin of the API (the base URL without its `/v1` suffix) — for the unversioned ops routes. */
export const API_ORIGIN = BASE_URL.replace(/\/v1$/, '');

/** Typed error carrying the API's `{ error: { code, message } }` envelope (NFR-6). */
export class TesseraApiError extends Error {
  readonly code: ErrorCode | 'NETWORK';
  readonly status: number;
  readonly details: unknown;

  constructor(message: string, code: ErrorCode | 'NETWORK', status: number, details?: unknown) {
    super(message);
    this.name = 'TesseraApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { headers, ...rest } = init ?? {};
  // Only declare a JSON content-type when a body is actually sent — Fastify rejects a bodyless
  // request that still advertises `application/json` (e.g. POST /sources/:id/scan, DELETE).
  const jsonHeader = rest.body !== undefined ? { 'content-type': 'application/json' } : {};

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...rest,
      headers: { ...jsonHeader, ...headers },
    });
  } catch (cause) {
    throw new TesseraApiError('Could not reach the Tessera API.', 'NETWORK', 0, cause);
  }

  const text = await response.text();
  const data: unknown = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    const envelope = data as ErrorEnvelope | undefined;
    throw new TesseraApiError(
      envelope?.error?.message ?? response.statusText,
      envelope?.error?.code ?? 'INTERNAL',
      response.status,
      envelope?.error?.details,
    );
  }

  return data as T;
}

/**
 * Fetch an **unversioned** ops route (`/health`, `/ready`) off the API origin. `/ready` answers
 * `503` with a valid readiness body when a dependency is down, so those statuses are read as data
 * (via `okStatuses`) rather than raised as errors.
 */
async function rootFetch<T>(path: string, okStatuses: readonly number[] = [200]): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_ORIGIN}${path}`, {
      headers: { 'content-type': 'application/json' },
    });
  } catch (cause) {
    throw new TesseraApiError('Could not reach the Tessera API.', 'NETWORK', 0, cause);
  }

  const text = await response.text();
  const data: unknown = text ? JSON.parse(text) : undefined;

  if (!okStatuses.includes(response.status)) {
    const envelope = data as ErrorEnvelope | undefined;
    throw new TesseraApiError(
      envelope?.error?.message ?? response.statusText,
      envelope?.error?.code ?? 'INTERNAL',
      response.status,
      envelope?.error?.details,
    );
  }

  return data as T;
}

/** The dashboard's only data path (ADR-0022). Swapped for the generated @tessera/sdk at F-022. */
export const api = {
  search: (body: SearchBody): Promise<SearchResponse> =>
    apiFetch<SearchResponse>('/search', { method: 'POST', body: JSON.stringify(body) }),
  compile: (body: CompileBody): Promise<ContextPackage> =>
    apiFetch<ContextPackage>('/compile', { method: 'POST', body: JSON.stringify(body) }),
  captureMemory: (body: CaptureMemoryBody): Promise<Memory> =>
    apiFetch<Memory>('/memory', { method: 'POST', body: JSON.stringify(body) }),
  listMemories: (filter: MemoryListFilter = {}): Promise<MemoryListResponse> => {
    const params = new URLSearchParams();
    if (filter.kind) params.set('kind', filter.kind);
    if (filter.scope) params.set('scope', filter.scope);
    const qs = params.toString();
    return apiFetch<MemoryListResponse>(`/memory${qs ? `?${qs}` : ''}`);
  },
  getMemory: (lineageId: string): Promise<Memory> =>
    apiFetch<Memory>(`/memory/${encodeURIComponent(lineageId)}`),
  memoryHistory: (lineageId: string): Promise<MemoryHistoryResponse> =>
    apiFetch<MemoryHistoryResponse>(`/memory/${encodeURIComponent(lineageId)}/history`),
  editMemory: (lineageId: string, body: EditMemoryBody): Promise<Memory> =>
    apiFetch<Memory>(`/memory/${encodeURIComponent(lineageId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  getAudit: (query: AuditQuery = {}): Promise<AuditPage> => {
    const params = new URLSearchParams();
    if (query.action) params.set('action', query.action);
    if (query.outcome) params.set('outcome', query.outcome);
    if (query.actor) params.set('actor', query.actor);
    if (query.since) params.set('since', query.since);
    if (query.until) params.set('until', query.until);
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    if (query.cursor) params.set('cursor', query.cursor);
    const qs = params.toString();
    return apiFetch<AuditPage>(`/audit${qs ? `?${qs}` : ''}`);
  },

  // --- sources (F-038/FR-62): register + scan repositories through the ingestion pipeline ---
  listSources: (): Promise<SourceListResponse> => apiFetch<SourceListResponse>('/sources'),
  registerSource: (body: RegisterSourceBody): Promise<Source> =>
    apiFetch<Source>('/sources', { method: 'POST', body: JSON.stringify(body) }),
  removeSource: (id: string): Promise<{ id: string }> =>
    apiFetch<{ id: string }>(`/sources/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  scanSource: (id: string): Promise<ScanResult> =>
    apiFetch<ScanResult>(`/sources/${encodeURIComponent(id)}/scan`, { method: 'POST' }),
  getScanStatus: (id: string): Promise<ScanStatus> =>
    apiFetch<ScanStatus>(`/sources/${encodeURIComponent(id)}/scan`),

  // --- knowledge graph (F-043): explore the graph + ranked dependents (get_effects) ---
  queryGraph: (query: GraphQuery = {}): Promise<GraphSnapshot> => {
    const params = new URLSearchParams();
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    if (query.nodeKinds && query.nodeKinds.length > 0)
      params.set('nodeKinds', query.nodeKinds.join(','));
    if (query.edgeKinds && query.edgeKinds.length > 0)
      params.set('edgeKinds', query.edgeKinds.join(','));
    const qs = params.toString();
    return apiFetch<GraphSnapshot>(`/graph${qs ? `?${qs}` : ''}`);
  },
  getEffects: (query: EffectsQuery): Promise<EffectsResponse> => {
    const params = new URLSearchParams({ kind: query.kind, key: query.key });
    if (query.maxDepth !== undefined) params.set('maxDepth', String(query.maxDepth));
    return apiFetch<EffectsResponse>(`/effects?${params.toString()}`);
  },

  // --- settings-facing reads (no config write surface; render read-only) ---
  getPlans: (): Promise<PlansResponse> => apiFetch<PlansResponse>('/billing/plans'),
  getHealth: (): Promise<HealthStatus> => rootFetch<HealthStatus>('/health'),
  getReady: (): Promise<ReadyStatus> => rootFetch<ReadyStatus>('/ready', [200, 503]),
};
