# ADR-0033: Data-plane per-tenant row isolation via `forTenant` scoping

- **Status:** Accepted
- **Date:** 2026-07-03
- **Deciders:** Project lead, Claude
- **Tags:** api, storage, memory, knowledge-graph, retrieval, tenancy, security, multi-tenancy

## Context

FR-52 requires **org/workspace isolation**. ADR-0028 (F-025) built the auth control plane: every request
resolves an `AuthContext` carrying a **`tenantId`**, but it explicitly deferred the **data plane** — the
domain stores (memory, knowledge-graph, retrieval indices, vector store) are **not** tenant-scoped, so
`tenantId` is *carried but not enforced*. There is no cross-tenant guarantee beyond the boundary: two
tenants share one row space. F-037 closes that seam across every verified store, which is why it was
deferred as its own `must` feature ("design before touching every verified store").

Two properties constrain the design: (1) the default **Local profile is zero-auth**, a single `default`
tenant, and must stay **byte-for-byte unchanged**; (2) the change spans ~7 packages and their conformance
suites — it has to be **additive** so the build stays green at every step and no existing method signature
or wire schema breaks.

## Decision

**Add per-tenant row isolation as a `forTenant(tenantId)` scoped view on every domain store, retriever,
and service, backed by a `tenant` column/partition enforced in the adapter. The base factory result is
bound to `DEFAULT_TENANT_ID`, so existing callers and tests are unchanged; real tenancy engages only when
the boundary threads a non-default `tenantId`.**

- **Tenant primitive in `@tessera/core`.** `TenantId` (opaque `string`) + `DEFAULT_TENANT_ID = 'default'`
  move to the dependency-free base so domain packages scope by tenant **without depending on
  `@tessera/api`**. `@tessera/api/auth/model` re-exports them (its public API is unchanged; one source of
  truth). Additive on `E-006`.
- **`forTenant(tenantId): Self`** is added to `MemoryStore`, `GraphStore`, `VectorStore`, the `Retriever`
  port, `HybridRetriever`, `ContextCompiler`, and the three domain services. It returns a view confined to
  that tenant; the factory's own return value is the `DEFAULT_TENANT_ID` view. **No existing method changes
  signature.**
- **Enforcement lives in the adapter**, not a bypassable wrapper: a `tenant`/`tenant_id` column (SQLite/
  Postgres) or a `vec0` **partition key** (sqlite-vec) is injected on write and filtered on **every** read.
  For `knowledge-graph.getEffects` the tenant predicate is applied in **both** the anchor and recursive arms
  of the CTE.
- **Tenancy stays off the wire.** `Memory`, `ContextPackage`, `CompileRequest`, and the REST/MCP schemas
  gain **no** tenant field — isolation is a server-side storage guarantee driven by `AuthContext.tenantId`.
  So OpenAPI + the generated SDK are unaffected (`E-003` advances without a schema change).
- **Threading:** REST routes call `services.<x>.forTenant(request.authContext?.tenantId ?? DEFAULT_TENANT_ID)`;
  the MCP `guard()` already returns the resolved `AuthContext`, so tool handlers use `ctx.tenantId`
  (ungated → default).

## Consequences

### Positive
- A **real** FR-52 guarantee: data written under tenant A is unreadable under tenant B across memory, graph,
  keyword/temporal/semantic retrieval, and the vector store — proven by an **isolation case added to each
  shared conformance suite** (so every current + future adapter must satisfy it), including **live pgvector**
  against the Docker container.
- **Zero regression / back-compat:** the base view is the `default` tenant, so the Local profile and every
  existing test behave identically; enforcement is opt-in via a non-default `tenantId`.
- Isolation composes with the existing RBAC/quota/entitlement layers (same `AuthContext`); no wire/SDK
  change.

### Negative / Costs
- Broad surface: a new `forTenant` on many ports/adapters/services and a tenant column/partition on several
  tables. Mitigated by the additive, default-tenant strategy and landing package-by-package with gates green.
- A tenant predicate is now on the hot path of every store read (indexed, negligible) and the vec0 index is
  partitioned by tenant.

### Neutral / Follow-ups (documented seams)
- Postgres-backed **memory/graph** stores are still a seam (they run on SQLite today); when they land they
  inherit the same `tenant_id` contract + conformance case. pgvector/Postgres **RelationalStore** isolation
  is covered where the port is keyed.
- Cross-tenant **admin** operations, per-tenant quotas/usage, and tenant lifecycle (create/delete/migrate)
  remain future work; F-037 is the row-isolation guarantee, not tenant management.
- Ingestion populating per-tenant retrieval/vector indices uses the same `forTenant` seam (the corpus
  population is an existing ingestion seam).

## Alternatives considered

- **Thread `tenantId` as an explicit parameter on every store/service method.** Rejected: changes every
  existing signature + conformance call site (large, non-additive diff, breaks the green-at-every-step
  requirement) for no isolation benefit over a scoped view.
- **Per-request service construction at the composition root keyed by tenant.** Rejected: impractical for
  dynamic tenants over a shared DB; `forTenant` is exactly this, lazily and locally.
- **Separate database/schema per tenant.** Rejected for the local-first default (a single embedded SQLite
  file); a row/partition column gives isolation without a provisioning system. A DB-per-tenant deployment
  can still be layered later behind the same `forTenant` seam.
- **Put `tenantId` on the domain entities + wire schemas.** Rejected: leaks a deployment concern into the
  product contract and ripples to OpenAPI/SDK/web; isolation is a storage guarantee, not a payload field.

## References

- FR-52, NFR-2; [ADR-0028](0028-api-auth-tenancy-rbac.md) (the `tenantId` seam this realizes),
  [ADR-0003](0003-local-first-cloud-ready-ports-and-adapters.md) (ports & adapters + shared conformance),
  [ADR-0026](0026-postgres-pgvector-adapters.md) (pgvector). Effects `E-018` (data-plane isolation realized)
  + `E-001`/`E-007`/`E-010`/`E-011`/`E-012`/`E-013` (each port gains `forTenant`; each adapter + shared
  conformance suite gain the isolation case) + `E-003` (REST/MCP thread `tenantId`; schemas unchanged).
