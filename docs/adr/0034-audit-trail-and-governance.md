# ADR-0034: Audit trail via an `AuditLog` port recorded at the API boundary + governance surface

- **Status:** Accepted
- **Date:** 2026-07-03
- **Deciders:** Project lead, Claude
- **Tags:** api, config, web, audit, governance, security, compliance, multi-tenancy

## Context

R3 (enterprise) requires a **full audit trail** of sensitive actions (FR-55) and a **governance UI**
(FR-48: users/roles, audit log, retention) for a SOC2/GDPR-ready posture (NFR-13). The pieces it needs
already exist: every request resolves an `AuthContext` (actor + tenant, ADR-0028), the domain stores are
tenant-isolated (ADR-0033), and there is a proven pattern (ADR-0030/F-034) for a capability whose
**model + port + in-memory adapter** live in the Fastify-free `@tessera/api` core while the **persistent
SQLite adapter + wiring** live in `@tessera/config` (the composition root that owns the Drizzle handle).

## Decision

**Add an `AuditLog` port whose events are recorded at the `/v1` boundary by a `buildServer` hook, queried
via `GET /v1/audit` (admin-only, tenant-scoped), and persisted by a SQLite adapter wired in
`@tessera/config`. Default is a local in-memory sink so the feature is additive.**

- **Model (Fastify-free core):** `AuditEvent { id, tenantId, actor {principalId, kind}, action, target?,
  outcome: 'success' | 'denied', at, metadata? }` — JSON-safe, **non-sensitive** (ids/actions/outcomes only,
  never request bodies/secrets/raw content, NFR-7). An `AUDIT_ACTIONS` catalog maps sensitive routes to a
  stable action name.
- **Port:** `AuditLog { record(event); query(AuditQuery); prune(RetentionPolicy); forTenant(tenantId) }` —
  **append-only** (no update/delete except retention prune), tenant-scoped via `forTenant` (ADR-0033).
  Adapters: `createInMemoryAuditLog` (reference, drives the shared conformance) + `createSqliteAuditLog`
  (persistent, an `audit_events` table with a tenant column).
- **Recording:** an `onResponse` hook records an event for routes flagged with an `audit` action in their
  route config, taking actor/tenant from `request.authContext` and `outcome` from the status code. Recording
  **never breaks a request** — sink errors are swallowed/logged (failure isolation).
- **Query:** `GET /v1/audit` requires `admin:manage` (reuse the existing permission — no RBAC-catalog
  ripple), scopes to `auditLog.forTenant(tenantOf(request))`, and filters/paginates via a Zod query → the
  OpenAPI doc + regenerated SDK.
- **Retention (NFR-13):** a configurable policy (`maxAgeDays` / `maxEntries`) prunes the trail; `config.audit`
  + `TESSERA_AUDIT_*` env select the sink + policy; `Runtime.audit` + the server wire it (opportunistic prune).
- **Governance UI (FR-48, `@tessera/web`):** an Audit Log view (filter by action/actor/outcome/date) + a
  Governance view (roles/permissions from the RBAC catalog + retention settings) consuming `GET /v1/audit`.

## Consequences

### Positive
- A real, tenant-isolated audit trail for sensitive actions with an admin query surface and retention —
  the FR-55/NFR-13 compliance posture — reusing the auth/tenancy already built (actor + tenant for free).
- **Additive / back-compatible:** default in-memory sink; recording is an opt-in-per-route hook; existing
  routes/tools/e2e unchanged. Persistence + retention engage via config.
- Consistent with the token-store precedent (ADR-0030): Fastify-free core + SQLite adapter in the
  composition root, so the MCP process stays Fastify-free and there is no wrong-way dependency.

### Negative / Costs
- A recording hook on the hot path (cheap: one append of a small row; async, failure-isolated).
- Another SQLite table + a config section + env vars (documented; env-docs guard enforces).

### Neutral / Follow-ups (documented seams)
- MCP-surface audit recording (the same `AuditLog` can be injected into the MCP gateway).
- Full user management / SSO (FR-48 "users") beyond roles/permissions display; data export/delete (DSR) and
  configurable encryption (NFR-13) are further R3 posture items.
- A distributed/append-only external audit sink (e.g. object storage / SIEM) behind the same port.

## Alternatives considered

- **A separate `@tessera/audit` domain package (like `@tessera/billing`).** Reasonable, but audit is tightly
  coupled to the API request lifecycle (actor/outcome/route) — recording lives at the boundary. Keeping the
  core in `@tessera/api` (Fastify-free) + the SQLite adapter in config matches the token-store precedent and
  avoids an extra package for a boundary concern. Can be extracted later if reused off the API.
- **Emit audit as domain events on the existing `EventBus`/`ApiEventBus` (SSE, F-021).** The event bus is for
  live UI push, not durable/queryable/retained records; audit needs append-only persistence + admin query +
  retention. A hook writing to the port is the right durable path (the bus can additionally fan out later).
- **Log-only (Pino) audit.** Structured logs are not queryable/tenant-scoped/retained as a first-class trail;
  compliance needs a queryable store. Logs remain complementary.

## References

- FR-48, FR-55, NFR-13; PRD §12/roadmap R3. [ADR-0028](0028-api-auth-tenancy-rbac.md) (actor/tenant/RBAC),
  [ADR-0030](0030-auth-composition-root-wiring.md) (Fastify-free core + SQLite adapter in config),
  [ADR-0033](0033-data-plane-tenant-isolation.md) (`forTenant` tenant scoping),
  [ADR-0022](0022-interim-dashboard-data-client.md) (web data client). Effects `E-003` (route/schema/SDK),
  `E-014` (config wiring), `E-018` (auth model consumer), new `E-020` (audit-trail contract).
