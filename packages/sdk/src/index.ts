/**
 * @tessera/sdk — the first-class TypeScript client for the Tessera `/v1` API (FR-39).
 *
 * The request/response **types are generated** from the API's OpenAPI document
 * (`pnpm --filter @tessera/sdk generate` → `src/generated/schema.ts`), so the client can never drift
 * from the contract (ADR-0016/0025). `createTesseraClient` wraps them in an ergonomic, typed client
 * that maps the `{ error }` envelope to a {@link TesseraApiError}. Supersedes the interim
 * `apps/web/lib/api` (ADR-0022) once the web app adopts it.
 */
export {
  createTesseraClient,
  type TesseraClient,
  type TesseraClientOptions,
  type SearchRequest,
  type SearchResults,
  type CompileRequest,
  type ContextPackage,
  type EffectsQuery,
  type EffectsResult,
  type CaptureMemoryRequest,
  type EditMemoryRequest,
  type MemoryListQuery,
  type MemoryList,
  type Memory,
  type MemoryHistory,
  type AuditQuery,
  type AuditPage,
  type AuditExportQuery,
  type AuditExport,
  type RegisterSourceRequest,
  type Source,
  type SourceList,
  type ScanAccepted,
  type ScanStatus,
  type WorkspaceStats,
  type GraphQuery,
  type GraphSnapshot,
  type AssertEffectRequest,
  type EffectLink,
  type Identity,
  type RbacCatalog,
  type TokenList,
  type CreateTokenRequest,
  type CreatedToken,
  type Plans,
  type Subscription,
  type HealthStatus,
  type ReadyStatus,
} from './client.js';
export { TesseraApiError, parseErrorEnvelope, type TesseraErrorBody } from './errors.js';
export type { paths } from './generated/schema.js';
