/**
 * Tenancy + project scope primitives (FR-52, FR-66). The data-plane scope is `(tenantId, projectId)`:
 * a tenant is an opaque org/workspace boundary, and a project is a first-class scope **under** the
 * tenant (ADR-0037) so one org can keep several codebases' context disjoint.
 *
 * These live in `@tessera/core` — the dependency-free base — so every domain package (memory, graph,
 * retrieval, storage) can scope its rows **without** depending on `@tessera/api`. The API auth layer
 * (ADR-0028) re-exports them and resolves a request's `tenantId`/`projectId`; the stores use
 * `forTenant(tenantId)` (ADR-0033) then `forProject(projectId)` (ADR-0037) to confine reads/writes to
 * one `(tenant, project)` scope.
 */

/** A tenant (org/workspace) boundary. Opaque string; the data plane scopes rows by it. */
export type TenantId = string;

/**
 * The single tenant the zero-auth Local profile serves, and the default a store's base view is bound
 * to. Existing (non-tenant-aware) callers therefore operate entirely within this tenant, so behavior
 * is unchanged until a non-default `tenantId` is threaded from the boundary.
 */
export const DEFAULT_TENANT_ID: TenantId = 'default';

/**
 * A project boundary **within** a tenant (ADR-0037). Opaque string; the data plane scopes every row by
 * `(tenantId, projectId)`. The reserved {@link DEFAULT_PROJECT_ID} is implicit and always present.
 */
export type ProjectId = string;

/**
 * The reserved project a store's base view is bound to, and the one existing single-project deployments
 * (and all current tests) operate within. Like {@link DEFAULT_TENANT_ID}, it keeps behavior byte-for-byte
 * unchanged until a non-default `projectId` is threaded from the boundary; it is implicit and undeletable.
 */
export const DEFAULT_PROJECT_ID: ProjectId = 'default';
