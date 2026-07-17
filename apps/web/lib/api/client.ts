import { createTesseraClient, TesseraApiError } from '@tessera/sdk';
import { PROXY_BASE } from '@/lib/auth/session';
import type {
  AuditExport,
  AuditExportQuery,
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
  ScanAccepted,
  ScanStatus,
  SearchBody,
  SearchResponse,
  Source,
  SourceListResponse,
} from './types';
import type {
  CreatedToken,
  CreateTokenRequest,
  Identity,
  RbacCatalog,
  Subscription,
  TokenList,
  WorkspaceStats,
  WorkspaceActivity,
} from '@tessera/sdk';

/**
 * The dashboard's data client (ADR-0048, closing ADR-0022). It is the generated **`@tessera/sdk`**
 * pointed at the **same-origin proxy** (`/api/tessera`); the proxy injects the bearer from the
 * httpOnly session cookie, so no token ever lives in client JS. The `api` surface + `TesseraApiError`
 * are kept stable so the TanStack Query hooks and views are unchanged.
 */
const sdk = createTesseraClient({ baseUrl: PROXY_BASE });

export { TesseraApiError };
export type {
  Identity,
  RbacCatalog,
  TokenList,
  CreatedToken,
  CreateTokenRequest,
  Subscription,
  WorkspaceStats,
  WorkspaceActivity,
};

/** Label for the endpoint the dashboard talks to (the same-origin proxy). Shown in Settings. */
export const API_ORIGIN = PROXY_BASE;

/** The dashboard's only data path — the generated SDK over the auth-aware same-origin proxy. */
export const api = {
  /** The caller's resolved identity (401 when a token is required but absent/invalid). */
  me: (): Promise<Identity> => sdk.me(),

  // --- account & access (F-046) ---
  /** The RBAC catalog (roles/permissions/role→permissions), derived from the API. */
  getRbac: (): Promise<RbacCatalog> => sdk.getRbac(),
  /** List the tenant's API tokens (admin:manage; 409 in zero-auth mode). */
  listTokens: (): Promise<TokenList> => sdk.listTokens(),
  /** Issue a scoped token — the secret is returned once (admin:manage). */
  createToken: (body: CreateTokenRequest): Promise<CreatedToken> => sdk.createToken(body),
  /** Revoke a token by id (admin:manage). */
  revokeToken: (id: string): Promise<{ id: string; revoked: true }> => sdk.revokeToken(id),
  /** The tenant's current subscription (admin:manage). */
  getSubscription: (): Promise<Subscription> => sdk.getSubscription(),

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
  /** Every audit event matching the filters — the server pages to completeness and audits the export. */
  exportAudit: (query: AuditExportQuery = {}): Promise<AuditExport> => sdk.exportAudit(query),

  // --- sources (F-038/FR-62) ---
  /** The workspace summary: documents, memories, graph, sources, last scan (F-060; stats:read). */
  getStats: (): Promise<WorkspaceStats> => sdk.getStats(),
  /** Daily activity for the Overview chart, audit-derived + floored to the trail (F-084). */
  getActivity: (days?: number): Promise<WorkspaceActivity> =>
    sdk.getActivity(days !== undefined ? { days } : undefined),

  listSources: (): Promise<SourceListResponse> => sdk.listSources(),
  registerSource: (body: RegisterSourceBody): Promise<Source> => sdk.registerSource(body),
  removeSource: (id: string): Promise<{ id: string }> => sdk.removeSource(id),
  scanSource: (id: string): Promise<ScanAccepted> => sdk.scanSource(id),
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
