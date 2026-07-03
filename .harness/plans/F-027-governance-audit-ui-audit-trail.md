# Plan: F-027 — Governance & audit UI + full audit trail (R3 kickoff)

- **Feature:** F-027 (see [`../state/feature_list.json`](../state/feature_list.json)) · **Requirements:** FR-48, FR-55, NFR-13
- **ADRs:** **0034 (new — audit trail port + governance surface)**; relates to 0028 (auth/RBAC — actor/tenant), 0030 (Fastify-free `@tessera/api/auth` subpath + SQLite adapters in config), 0033 (tenant `forTenant` scoping), 0022 (web data client)
- **Packages:** `@tessera/api` (audit core + recording + route) · `@tessera/config` (SQLite adapter + wiring) · `@tessera/server` (wire) · `@tessera/sdk` (regen) · `@tessera/web` (UI) · **Author:** Claude · **Date:** 2026-07-03
- **Verification:** typecheck · lint · test · e2e (web a11y + a cross-tenant audit e2e)

## Intent
The R3 enterprise feature: a **full audit trail** of sensitive actions (FR-55, NFR-13 SOC2/GDPR posture)
and a **governance & audit UI** (FR-48: users/roles, audit log, retention). Built on the R2 auth/tenancy
(actor + tenant come from the `AuthContext`) and F-037 tenant isolation.

## Decision (ADR-0034): an `AuditLog` port, recorded at the API boundary, mirroring the token-store pattern
Reuse the proven F-034 shape: the **model + port + in-memory adapter** live in the **Fastify-free
`@tessera/api` audit core**; the **persistent SQLite adapter + wiring** live in **`@tessera/config`** (the
composition root already owns the Drizzle handle); the API records events in a **`buildServer` hook** and
exposes a query route. Tenant isolation via `forTenant` (ADR-0033). Default is a local in-memory sink →
additive, existing surfaces unchanged.

## Increment 1 — Audit trail backend (this increment; fully verifiable, no UI)
- **`apps/api/src/audit/` (new, Fastify-free, exported via `@tessera/api/auth` core barrel or a new
  `@tessera/api/audit`):**
  - `model.ts`: `AuditEvent { id, tenantId, actor {principalId, kind}, action, target?, outcome
    'success'|'denied', at (ISO), metadata? }` (JSON-safe, **non-sensitive** — never bodies/secrets, NFR-7);
    `AUDIT_ACTIONS` catalog (e.g. `memory.write`, `memory.read`, `search`, `compile`, `effects.read`,
    `billing.manage`, `audit.read`). `AuditQuery { action?, actor?, outcome?, since?, until?, limit?, cursor? }`.
  - `port.ts`: `AuditLog { record(event): Promise<void>; query(q): Promise<{ events; nextCursor? }>;
    prune(policy): Promise<number>; forTenant(tenantId): AuditLog }` — **append-only**.
  - `in-memory.ts`: `createInMemoryAuditLog()` (reference; drives conformance + tests).
  - `recorder.ts`: `auditActionForRoute` map + `recordAudit(app, auditLog)` — an `onResponse` hook that,
    for routes flagged `audit: <action>` in their route config, records `{actor,tenant}` from
    `request.authContext`, `outcome` from the status (2xx→success, 401/403→denied), `at`, minimal target.
- **`apps/api/src/routes/v1/audit.ts`:** `GET /v1/audit` (`requirePermission('admin:manage')`, tenant-scoped
  via `auditLog.forTenant(tenantOf(request))`, Zod query → filter/paginate) → `{ events, nextCursor? }`;
  Zod schemas → OpenAPI. `buildServer` gains `audit?: AuditLog` (default `createInMemoryAuditLog()`), calls
  `recordAudit`, registers the route. Reuse `admin:manage` (no RBAC-catalog ripple).
- **Conformance:** `tests/conformance/audit-log.conformance.ts` — append+query+filter+paginate, prune by
  age/count, **cross-tenant isolation** (`forTenant` A vs B). Run against in-memory now + SQLite (increment 1b).
- **`@tessera/config`:** `createSqliteAuditLog(db)` (persistent, `audit_events` table, tenant column +
  `forTenant`, retention prune) passing the same conformance; `config.audit { enabled, retention
  {maxAgeDays?, maxEntries?} }` + `TESSERA_AUDIT_*` env (documented in `.env.example` — env-docs guard);
  `Runtime.audit`; `apps/server` passes it to `buildServer` + a periodic/opportunistic prune.
- **`@tessera/sdk`:** regenerate (new `/v1/audit`).

## Increment 2 — Governance & audit UI (`@tessera/web`, FR-48; next increment)
- `app/audit` (Audit Log view: filter by action/actor/outcome/date, provenance-first table, empty/error
  states) + `app/governance` (Roles/permissions from the RBAC catalog; retention settings display) consuming
  `GET /v1/audit` via `lib/api`; nav entries in `lib/nav.ts`; enterprise-grade per DESIGN-SYSTEM.md, WCAG AA,
  **screenshot-verified**; Playwright + axe e2e.

## Anticipated effects
- **E-003** (new `GET /v1/audit` route + schemas → OpenAPI + SDK; a recording hook — additive).
- **E-014** (config `audit` section + `Runtime.audit` + SQLite adapter wiring).
- **E-018** (audit consumes the auth model: actor/tenant from `AuthContext`; `admin:manage` guards the query).
- New **E-020** likely (the audit-trail contract: port + model + adapters + conformance).

## Test plan
- **Unit/conformance:** in-memory + SQLite audit log (append/query/filter/paginate/prune/**tenant isolation**).
- **API e2e:** a member's memory write records `memory.write success`; a viewer's denied write records
  `memory.write denied`; `GET /v1/audit` returns only the caller-tenant's events (cross-tenant isolation);
  non-admin gets 403; default build still green.
- **Web e2e (increment 2):** audit view renders + filters; axe WCAG A/AA clean.

## Verification
`node scripts/verify-state.mjs` (incl. env-docs) · `pnpm typecheck · lint · format:check · test · build ·
test:e2e`. SDK regenerated; OpenAPI includes `/v1/audit`.

## Risks / open questions
- **Never log sensitive content** (NFR-7): audit metadata is non-sensitive summaries only (ids/actions/
  outcomes) — assert in tests; reuse the Pino redaction ethos.
- **Recording overhead / failure isolation:** recording must never break the request — the hook swallows
  audit-sink errors (log, don't throw), like plugin failure isolation.
- **Retention correctness:** prune by age/count must be deterministic + tenant-safe; covered by conformance.
- **Scope:** land increment 1 (backend) first, verified + committed; the governance UI is increment 2 (its
  own commit) at the frontend quality bar.
