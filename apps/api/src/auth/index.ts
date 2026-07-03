/**
 * Auth surface for `@tessera/api` — tenancy + RBAC + scoped tokens (F-025; FR-52/FR-54/NFR-2).
 * The composition root injects an {@link AuthProvider} into `buildServer` (default: the zero-auth
 * Local provider). See ADR-0028 for the design and the OIDC / data-plane-isolation seams.
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
export { registerAuth, requirePermission } from './plugin.js';
