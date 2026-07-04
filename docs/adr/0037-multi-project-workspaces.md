# ADR-0037: Multi-project workspaces within a tenant

- **Status:** Accepted
- **Date:** 2026-07-04
- **Deciders:** Project lead + supervising architect session
- **Tags:** domain, tenancy, storage, api, dashboard

## Context

An account (tenant/org) today owns exactly one corpus: one set of sources, one retrieval
index, one memory store, one knowledge graph. Real users have **several projects with
disjoint context** — mixing them poisons retrieval (cross-project fragments outrank
in-project ones) and blocks the hosted product (a team's repos ≠ one blob of context).
The product lead asked directly whether accounts should support multiple projects with
separate storage. F-037 (ADR-0033) already built the isolation mechanism —
`forTenant` scoping enforced inside every adapter — which generalizes cleanly.

## Decision

We will introduce **Project as a first-class scope under the tenant**:

- **Scope model:** data-plane scope becomes `(tenantId, projectId)`. A reserved
  `default` project preserves back-compat exactly like `DEFAULT_TENANT_ID` did in
  ADR-0033: existing single-project deployments and all current tests behave
  identically without changes.
- **Isolation:** each project owns its **sources, ingestion state, retrieval indices
  (keyword/semantic/temporal), fragments, memory lineages, knowledge graph, and
  compilation cache keys**. Enforcement lives in the adapters (scope column /
  scoped tables), extending the proven `forTenant` pattern to a
  `forScope(tenantId, projectId)` (or chained `forTenant(t).forProject(p)`) view —
  never a bypassable wrapper.
- **Control plane:** projects are CRUD-managed via REST `/v1/projects` + MCP tools +
  dashboard (project switcher in the app shell); project lifecycle events are audited
  (E-020). RBAC stays **tenant-level roles for now**; per-project role overrides are a
  documented seam (do not build until a customer needs them).
- **Selection:** REST callers select a project via an explicit header/parameter
  (`X-Tessera-Project` or query/body field — implementing feature decides one and
  records it in the OpenAPI doc); MCP sessions carry a project in their session/config;
  omitted → `default` project. The project id is validated against the caller's tenant
  **on every request** (no cross-tenant project reference).
- **Billing/quotas:** entitlements remain per-tenant; per-project quota split is a seam.

## Consequences

### Positive
- Answers the product question with the industry-standard shape (org → projects), and
  supports "different storage per project" naturally — each project's indices are
  physically scoped.
- Reuses a mechanism that already passed conformance + live-Postgres verification
  (ADR-0033), so the risk is a widening, not a new invention.
- Retrieval quality improves for everyone with >1 codebase — context never bleeds.

### Negative / Costs
- Another dimension threaded through stores, services, API, MCP, cache keys, and the
  dashboard; the compile cache key and audit events must include the project or go
  stale/ambiguous.
- Migration for existing rows (→ `default` project) must be additive and reversible
  (migration runner from F-024).

### Neutral / Follow-ups
- Realized by **F-050** (must, R4) after the source-management loop (F-038/F-039)
  exists — projects without per-project sources would be an empty shell.
- Local single-dev mode keeps working with zero configuration (implicit `default`).

## Alternatives considered

- **Project = tenant (one org per project)** — rejected: breaks the account model
  (membership, billing, RBAC would fragment per repo); hosted UX would be miserable.
- **Prefix/namespace conventions inside one index** (e.g., ref prefixes) — rejected:
  bypassable, leaks via ranking, contradicts ADR-0033's "enforce in the adapter" rule.
- **Separate deployment per project** — rejected for hosted (that's just "no
  multi-project"); remains fine locally where it is free.

## References

- Related: ADR-0033 (tenant isolation — the mechanism this extends), ADR-0028 (RBAC),
  ADR-0034 (audit), PRD FR-66, F-050.
