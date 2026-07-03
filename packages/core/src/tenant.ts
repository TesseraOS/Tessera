/**
 * Tenancy primitive (FR-52). An opaque org/workspace boundary that scopes data in the store layer.
 *
 * It lives in `@tessera/core` — the dependency-free base — so every domain package (memory, graph,
 * retrieval, storage) can scope its rows by tenant **without** depending on `@tessera/api`. The API
 * auth layer (ADR-0028) re-exports these and is what resolves a request's `tenantId`; the stores use
 * `forTenant(tenantId)` to confine reads/writes to one tenant (ADR-0033).
 */

/** A tenant (org/workspace) boundary. Opaque string; the data plane scopes rows by it. */
export type TenantId = string;

/**
 * The single tenant the zero-auth Local profile serves, and the default a store's base view is bound
 * to. Existing (non-tenant-aware) callers therefore operate entirely within this tenant, so behavior
 * is unchanged until a non-default `tenantId` is threaded from the boundary.
 */
export const DEFAULT_TENANT_ID: TenantId = 'default';
