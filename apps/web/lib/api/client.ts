import { createTesseraClient, TesseraApiError } from '@tessera/sdk';
import { PROXY_BASE } from '@/lib/auth/session';
import type {
  AuditPage,
  AuditQuery,
  CaptureMemoryBody,
  CompileBody,
  ContextPackage,
  EditMemoryBody,
  EffectsQuery,
  EffectsResponse,
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
import type { Identity } from '@tessera/sdk';

/**
 * The dashboard's data client (ADR-0048, closing ADR-0022). It is the generated **`@tessera/sdk`**
 * pointed at the **same-origin proxy** (`/api/tessera`); the proxy injects the bearer from the
 * httpOnly session cookie, so no token ever lives in client JS. The `api` surface + `TesseraApiError`
 * are kept stable so the TanStack Query hooks and views are unchanged.
 */
const sdk = createTesseraClient({ baseUrl: PROXY_BASE });

export { TesseraApiError };
export type { Identity };

/** Label for the endpoint the dashboard talks to (the same-origin proxy). Shown in Settings. */
export const API_ORIGIN = PROXY_BASE;

/** The dashboard's only data path — the generated SDK over the auth-aware same-origin proxy. */
export const api = {
  /** The caller's resolved identity (401 when a token is required but absent/invalid). */
  me: (): Promise<Identity> => sdk.me(),

  search: (body: SearchBody): Promise<SearchResponse> => sdk.search(body),
  compile: (body: CompileBody): Promise<ContextPackage> => sdk.compile(body),
  captureMemory: (body: CaptureMemoryBody): Promise<Memory> => sdk.captureMemory(body),
  listMemories: (filter: MemoryListFilter = {}): Promise<MemoryListResponse> =>
    sdk.listMemories(filter),
  getMemory: (lineageId: string): Promise<Memory> => sdk.getMemory(lineageId),
  memoryHistory: (lineageId: string): Promise<MemoryHistoryResponse> =>
    sdk.memoryHistory(lineageId),
  editMemory: (lineageId: string, body: EditMemoryBody): Promise<Memory> =>
    sdk.editMemory(lineageId, body),
  getAudit: (query: AuditQuery = {}): Promise<AuditPage> => sdk.getAudit(query),

  // --- sources (F-038/FR-62) ---
  listSources: (): Promise<SourceListResponse> => sdk.listSources(),
  registerSource: (body: RegisterSourceBody): Promise<Source> => sdk.registerSource(body),
  removeSource: (id: string): Promise<{ id: string }> => sdk.removeSource(id),
  scanSource: (id: string): Promise<ScanResult> => sdk.scanSource(id),
  getScanStatus: (id: string): Promise<ScanStatus> => sdk.scanStatus(id),

  // --- knowledge graph (F-043) — node/edge-kind arrays are sent comma-joined (the API query shape) ---
  queryGraph: (query: GraphQuery = {}): Promise<GraphSnapshot> =>
    sdk.queryGraph({
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
      ...(query.nodeKinds && query.nodeKinds.length > 0
        ? { nodeKinds: query.nodeKinds.join(',') }
        : {}),
      ...(query.edgeKinds && query.edgeKinds.length > 0
        ? { edgeKinds: query.edgeKinds.join(',') }
        : {}),
    }),
  getEffects: (query: EffectsQuery): Promise<EffectsResponse> => sdk.getEffects(query),

  // --- settings-facing reads (no config write surface; render read-only) ---
  getPlans: (): Promise<PlansResponse> => sdk.getPlans(),
  getHealth: (): Promise<HealthStatus> => sdk.getHealth(),
  getReady: (): Promise<ReadyStatus> => sdk.getReady(),
};
