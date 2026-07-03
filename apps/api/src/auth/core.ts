/**
 * Fastify-free auth core — the tenancy/RBAC model, the `AuthProvider` port + adapters, and the
 * `TokenStore` port + in-memory adapter (F-025). Exposed as the `@tessera/api/auth` subpath so
 * **non-HTTP consumers** (the `@tessera/config` composition root; type-only, the MCP gateway) can
 * construct auth without pulling Fastify. The Fastify enforcement plugin (`registerAuth`,
 * `requirePermission`) is intentionally **not** re-exported here — it lives on the main entry.
 */
export {
  DEFAULT_TENANT_ID,
  LOCAL_PRINCIPAL,
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS,
  buildAuthContext,
  createLocalAuthContext,
  effectivePermissions,
  hasPermission,
  permissionsForRoles,
  type AuthContext,
  type Permission,
  type Principal,
  type PrincipalKind,
  type Role,
  type TenantId,
} from './model.js';
export {
  createInMemoryTokenStore,
  hashApiTokenSecret,
  newApiTokenSecret,
  type ApiTokenRecord,
  type InMemoryTokenStoreOptions,
  type IssuedToken,
  type IssueTokenInput,
  type TokenStore,
} from './token-store.js';
export {
  createLocalAuthProvider,
  createTokenAuthProvider,
  parseBearer,
  type AuthInput,
  type AuthProvider,
} from './provider.js';
export { createOidcAuthProvider, type OidcAuthOptions } from './oidc.js';
