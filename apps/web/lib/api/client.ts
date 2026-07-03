import type {
  AuditPage,
  AuditQuery,
  CaptureMemoryBody,
  CompileBody,
  ContextPackage,
  ErrorCode,
  ErrorEnvelope,
  Memory,
  SearchBody,
  SearchResponse,
} from './types';

/** Base URL of the Tessera REST API. Configurable; defaults to the Local profile (F-032). */
const BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/v1').replace(
  /\/$/,
  '',
);

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

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...rest,
      headers: { 'content-type': 'application/json', ...headers },
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

/** The dashboard's only data path (ADR-0022). Swapped for the generated @tessera/sdk at F-022. */
export const api = {
  search: (body: SearchBody): Promise<SearchResponse> =>
    apiFetch<SearchResponse>('/search', { method: 'POST', body: JSON.stringify(body) }),
  compile: (body: CompileBody): Promise<ContextPackage> =>
    apiFetch<ContextPackage>('/compile', { method: 'POST', body: JSON.stringify(body) }),
  captureMemory: (body: CaptureMemoryBody): Promise<Memory> =>
    apiFetch<Memory>('/memory', { method: 'POST', body: JSON.stringify(body) }),
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
};
