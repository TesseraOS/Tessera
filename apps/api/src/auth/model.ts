/**
 * Auth domain model — tenancy + RBAC (FR-52, FR-54, NFR-2). Pure data + pure functions; no I/O and
 * no Fastify. The HTTP layer ({@link ./plugin}) resolves an {@link AuthContext} per request via an
 * {@link ./provider AuthProvider} and authorizes routes against a required {@link Permission}.
 *
 * Deployment note: the default Local profile is **zero-auth** — a single {@link DEFAULT_TENANT_ID}
 * and a full-access {@link LOCAL_PRINCIPAL}. Real tenancy/RBAC engages only when a credential-
 * requiring provider is injected (hosted/self-host). Data-plane per-tenant row isolation (scoping
 * the domain stores by `tenantId`) is a documented seam — see ADR-0028.
 */

// The tenant primitive now lives in @tessera/core (ADR-0033) so the domain stores can scope by tenant
// (`forTenant`) without depending on @tessera/api; imported for use below and re-exported to keep the
// auth model's public API stable (a request's tenant resolution stays co-located with the auth model).
import { DEFAULT_TENANT_ID, type TenantId } from '@tessera/core';

export { DEFAULT_TENANT_ID, type TenantId };

/** Roles, most- to least-privileged. The source of truth for {@link ROLE_PERMISSIONS}. */
export const ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

/**
 * The permission catalog — scoped capabilities a route can require. `read` grants query access to a
 * surface; `memory:write` mutates memory; `admin:manage` covers tenant/token administration.
 */
export const PERMISSIONS = [
  'search:read',
  'compile:read',
  'effects:read',
  'memory:read',
  'memory:write',
  'effects:write',
  'sources:read',
  'sources:manage',
  'projects:read',
  'projects:manage',
  'stats:read',
  'admin:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Read-only access to every query surface (no writes, no admin). */
const READ_PERMISSIONS: readonly Permission[] = [
  'search:read',
  'compile:read',
  'effects:read',
  'memory:read',
  'sources:read',
  // Every authenticated user can see the project list (it drives the app-shell switcher); creating,
  // renaming, and deleting projects is a `projects:manage` mutation (member+).
  'projects:read',
  // The workspace summary aggregates across documents, memory, graph and sources (F-060), so it is
  // its own permission rather than an existing read: a token scoped to only `memory:read` must not
  // learn graph/document counts through it (scopes are a least-privilege upper bound).
  'stats:read',
];

/**
 * Role → granted permissions. `owner`/`admin` are full-access (their distinction is org-lifecycle,
 * enforced elsewhere, not a permission difference); `member` adds writes to reads; `viewer` is
 * read-only. Extend the catalog here — every consumer derives from these two constants.
 */
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  owner: PERMISSIONS,
  admin: PERMISSIONS,
  member: [
    ...READ_PERMISSIONS,
    'memory:write',
    'effects:write',
    'sources:manage',
    'projects:manage',
  ],
  viewer: READ_PERMISSIONS,
};

/** Whether a principal is the local no-auth stand-in, an authenticated user, or an API token. */
export type PrincipalKind = 'local' | 'user' | 'token';

/** Who (or what) is making the request, and what they are allowed to be. */
export interface Principal {
  /** Stable id — a user id or a token id. */
  readonly id: string;
  readonly kind: PrincipalKind;
  readonly displayName?: string;
  readonly roles: readonly Role[];
  /**
   * For scoped API tokens: an **upper bound** on permissions (least privilege). Effective
   * permissions are the roles' permissions **intersected** with these scopes. `undefined` = no
   * extra cap beyond the roles.
   */
  readonly scopes?: readonly Permission[];
}

/** The resolved identity + tenant + effective permissions attached to a request. */
export interface AuthContext {
  readonly principal: Principal;
  readonly tenantId: TenantId;
  /** The principal's effective permissions (roles ∩ scopes) — precomputed for O(1) checks. */
  readonly permissions: ReadonlySet<Permission>;
}

/** Union of the permissions granted by a set of roles. */
export function permissionsForRoles(roles: readonly Role[]): Set<Permission> {
  const set = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role]) {
      set.add(permission);
    }
  }
  return set;
}

/**
 * A principal's effective permissions: the union of its roles' permissions, intersected with its
 * token scopes when present (least privilege — a token can never exceed what it was scoped to).
 */
export function effectivePermissions(principal: Principal): Set<Permission> {
  const rolePermissions = permissionsForRoles(principal.roles);
  if (principal.scopes === undefined) {
    return rolePermissions;
  }
  const scopeSet = new Set<Permission>(principal.scopes);
  const effective = new Set<Permission>();
  for (const permission of rolePermissions) {
    if (scopeSet.has(permission)) {
      effective.add(permission);
    }
  }
  return effective;
}

/** Build the {@link AuthContext} for a principal within a tenant (precomputes effective permissions). */
export function buildAuthContext(principal: Principal, tenantId: TenantId): AuthContext {
  return { principal, tenantId, permissions: effectivePermissions(principal) };
}

/** Whether a resolved context carries a permission. */
export function hasPermission(context: AuthContext, permission: Permission): boolean {
  return context.permissions.has(permission);
}

/** The full-access stand-in identity for the zero-auth Local profile (no login). */
export const LOCAL_PRINCIPAL: Principal = {
  id: 'local',
  kind: 'local',
  displayName: 'Local (no auth)',
  roles: ['owner'],
};

/** The full-access {@link AuthContext} the Local profile serves for every request. */
export function createLocalAuthContext(tenantId: TenantId = DEFAULT_TENANT_ID): AuthContext {
  return buildAuthContext(LOCAL_PRINCIPAL, tenantId);
}
