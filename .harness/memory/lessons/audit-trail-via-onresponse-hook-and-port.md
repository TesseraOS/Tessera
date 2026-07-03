---
id: audit-trail-via-onresponse-hook-and-port
kind: lesson
title: Build an audit trail as an AuditLog port recorded by an onResponse hook at the boundary (reuse the AuthContext; never the event bus)
links:
  - apps/api/src/audit/port.ts
  - apps/api/src/audit/recorder.ts
  - apps/api/src/routes/v1/audit.ts
  - packages/config/src/audit/sqlite-audit-log.ts
  - docs/adr/0034-audit-trail-and-governance.md
confidence: 0.9
created: 2026-07-04
---

**What happened:** F-027 added a full audit trail (FR-55/NFR-13) + a governance UI. The clean shape:

1. **An `AuditLog` port + an `onResponse` recording hook at the `/v1` boundary.** Routes opt in by
   flagging their config (`config.audit: 'memory.write'`); a single `onResponse` hook records one event —
   **actor + tenant come free from the already-resolved `AuthContext`**, and the **outcome from the status
   code** (`>=400` → `denied`, so an RBAC 403 is captured as a denied attempt). This beats sprinkling
   `audit.record(...)` calls in every handler, and captures denials the handler never even runs.
2. **Recording must be failure-isolated and non-sensitive.** The hook swallows sink errors (log, don't
   throw) so auditing never breaks a request; the `AuditEvent` carries ids/actions/outcomes only — never
   bodies/secrets/query content (NFR-7). Unauthenticated requests (no `AuthContext`) are skipped — they
   can't be attributed to a tenant.
3. **Don't use the live event bus (SSE) for audit.** That bus is for UI push; audit needs a **durable,
   queryable, retained, tenant-scoped** record. A hook writing to a port is the durable path; the bus can
   fan out additionally later.
4. **Reuse the token-store composition pattern (ADR-0030) for persistence.** Model + port + in-memory
   adapter live in the **Fastify-free** core of `@tessera/api`; the persistent SQLite adapter lives in
   `@tessera/config` and imports the audit contract **type-only**, so the composition root (and the MCP
   process booting through it) stays Fastify-free. Tenant scoping reuses `forTenant` (ADR-0033). A monotonic
   `seq`/rowid gives newest-first ordering + a **stable pagination cursor** (`seq < cursor`, append-safe).
5. **Query surface = `admin:manage`, tenant-scoped.** Reuse the existing permission (no RBAC-catalog
   ripple); scope the query to `forTenant(tenantOf(request))` so an admin only ever sees their own tenant.

**Project gotchas (Tessera web):** the dashboard has **two** navigation sources — `components/app-shared.tsx`
(`buildNavGroups`) feeds the **sidebar + breadcrumb**, while `lib/nav.ts` (`navItems`) feeds the **⌘K
palette**. A new route must be added to **both**. Also: a solid `destructive` Badge with small white text
**fails WCAG AA contrast** — use an outline + `text-destructive` colored-text treatment for status pills
(verified by the axe e2e).

**How to apply:**
- Model an audit/telemetry trail as a **port + a boundary hook keyed off route config**, deriving
  actor/outcome from the request lifecycle rather than instrumenting each handler.
- Keep recording **failure-isolated** and the payload **non-sensitive**; skip unattributable requests.
- For durability, put the Fastify-free model/port/in-memory in the API core and the persistent adapter in
  the composition root (type-only import); paginate with a monotonic seq cursor; scope by tenant with
  `forTenant`.
- When adding a UI route, wire **every** nav source; verify status-pill contrast with axe.
