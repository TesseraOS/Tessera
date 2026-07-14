/**
 * @tessera/api — the versioned REST surface over the Tessera engine (ARCHITECTURE §11; FR-37,
 * NFR-1/6/11).
 *
 * `buildServer(services)` assembles a Fastify app whose `/v1` routes wrap the F-007…F-010 domain
 * services (search / compile / effects / memory): Zod validation at the boundary, OpenAPI
 * generated from the same schemas (`GET /v1/openapi.json`), a consistent error envelope, and
 * `/health` + `/ready`. Services are injected (the composition seam F-015 fills with a deployment
 * profile); MCP (F-012) wraps the same services — one engine, two surfaces.
 */
export { buildServer, startServer } from './server.js';
export type { BuildServerOptions, CorsOptions, ListenOptions, RateLimitOptions } from './server.js';
export type { ApiServices, ReadinessCheck, ReadinessReport } from './services.js';

// API hardening (F-044; NFR-1/NFR-2) — security headers, per-key rate limiting, and request-id
// correlation. The composition root wires these per deployment profile; local defaults are safe.
export {
  registerSecurityHeaders,
  securityHeaders,
  type SecurityHeadersOptions,
} from './security/headers.js';
export {
  createInMemoryRateLimiter,
  rateLimitKey,
  registerRateLimit,
  type InMemoryRateLimitOptions,
  type RateLimitDecision,
  type RateLimiter,
  type RegisterRateLimitOptions,
} from './security/rate-limit.js';
export {
  REQUEST_ID_HEADER,
  REQUEST_ID_LOG_LABEL,
  generateRequestId,
  registerRequestId,
  requestIdFrom,
  sanitizeRequestId,
} from './security/request-id.js';

// Auth / tenancy / RBAC (F-025; FR-52/FR-54/NFR-2) — the composition root injects an AuthProvider
// into buildServer (default: zero-auth Local). See ADR-0028.
export {
  DEFAULT_TENANT_ID,
  LOCAL_PRINCIPAL,
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS,
  buildAuthContext,
  createInMemoryTokenStore,
  createLocalAuthContext,
  createLocalAuthProvider,
  createOidcAuthProvider,
  createTokenAuthProvider,
  effectivePermissions,
  hasPermission,
  parseBearer,
  permissionsForRoles,
  registerAuth,
  requirePermission,
  type ApiTokenRecord,
  type AuthContext,
  type AuthInput,
  type AuthProvider,
  type InMemoryTokenStoreOptions,
  type IssuedToken,
  type IssueTokenInput,
  type OidcAuthOptions,
  type Permission,
  type Principal,
  type PrincipalKind,
  type Role,
  type TenantId,
  type TokenStore,
} from './auth/index.js';
export {
  API_EVENT_TYPES,
  createApiEventBus,
  sseComment,
  sseFrame,
  type ApiEventBus,
  type ApiEventMap,
  type ApiEventType,
} from './events.js';

// Audit trail (F-027; FR-55/NFR-13) — the model/port/in-memory adapter are Fastify-free (the
// composition root builds a persistent adapter); recordAudit is the Fastify recording hook. See ADR-0034.
export {
  AUDIT_ACTIONS,
  DEFAULT_AUDIT_PAGE_SIZE,
  MAX_AUDIT_PAGE_SIZE,
  createInMemoryAuditLog,
  isAuditAction,
  recordAudit,
  toAuditEvent,
  type AuditAction,
  type AuditActor,
  type AuditEvent,
  type AuditEventInput,
  type AuditLog,
  type AuditMetadata,
  type AuditOutcome,
  type AuditPage,
  type AuditQuery,
  type RetentionPolicy,
} from './audit/index.js';
export { API_VERSION } from './plugins/openapi.js';

export type { ErrorEnvelope } from './errors/envelope.js';
export { codeForStatus, envelope, statusForCode } from './errors/envelope.js';
export { mapError, type MappedError } from './errors/error-handler.js';

export * from './schemas/common.js';
export * from './schemas/search.js';
export * from './schemas/compile.js';
export * from './schemas/effects.js';
export * from './schemas/graph.js';
export * from './schemas/memory.js';
export * from './schemas/sources.js';
export * from './schemas/billing.js';
export * from './schemas/audit.js';
