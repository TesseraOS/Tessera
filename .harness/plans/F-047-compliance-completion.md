# Plan: F-047 Compliance completion — memory retention, DSR export/delete, MCP-surface audit

- **Feature:** F-047 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-15 (memory retention/expiry), FR-55 (audit of sensitive actions), NFR-13
  (data-subject rights, retention, encryption-at-rest posture) — [`../../docs/PRD.md`](../../docs/PRD.md)
- **Service / package:** `@tessera/api` (DSR + retention routes, MCP-audit wiring), `@tessera/memory`
  (retention pass + delete/export port), `@tessera/mcp` (gateway audit), `@tessera/config` (retention
  config + MCP audit wiring), `@tessera/sdk` (regen); docs.
- **Governing decisions:** ADR-0034 (audit trail), ADR-0033 (tenant isolation via `forTenant`),
  ADR-0036 (REST+MCP parity). New **ADR-0049** for the three compliance decisions below.
- **Author:** Claude (orchestrator) · **Date:** 2026-07-16

## Intent
Close the compliance gaps the PRD requires but no feature delivered: (1) **memory retention/expiry**
(FR-15 — flagged R2, never shipped), (2) **data-subject rights** (NFR-13) — tenant data **export** +
**delete**, and (3) **MCP-surface audit** (closes the F-027 seam so agent tool calls are auditable, at
parity with REST). All tenant-scoped (`forTenant`), `admin:manage`-guarded where mutating, audited, and
covered by real e2e. No fake data; additive and reversible; existing verified behavior byte-stable
(local defaults keep retention off and DSR admin-only).

## Approach (three deliverables + docs; ~4 verified commits)

### D1 — Memory retention/expiry (FR-15) — `@tessera/memory` + `@tessera/config`
The audit trail already has retention (`AuditLog.prune`); memories do not. Add it symmetrically.
- **Port** (`ports/memory-store.ts`): add `deleteVersion(id)` (compaction of one superseded version),
  `deleteLineage(lineageId)` (expiry of a whole memory), and `exportAll()` (every version, tenant-scoped
  — also feeds DSR export). Implement in **both** adapters (in-memory + sqlite) + the shared conformance
  suite (incl. cross-tenant isolation: deleting/exporting in tenant A never touches B).
- **Retention pass** (`service/retention.ts`, pure): `MemoryRetentionRule` (`kind?`, `scope?`,
  `maxAgeMs?` → expire current versions older than that; `maxSupersededVersions?` / `maxSupersededAgeMs?`
  → prune old superseded versions) + `MemoryRetentionPolicy` (`rules[]`, most-specific rule wins) +
  `pruneMemories(store, policy, { now })` → `{ expiredLineages, prunedVersions }`. **Never silently
  mutates**: it only *deletes* whole expired lineages and *compacts* already-superseded versions; the
  current version of a kept lineage is never altered. Deterministic (injected clock).
- **Service** (`memory-service.ts`): add `prune(policy)`, `deleteLineage(lineageId)`, `exportAll()`
  (tenant-scoped, via `forTenant`).
- **Config** (`@tessera/config` schema + local profile): a `memory.retention` section (per-kind rules in
  days) → a resolved `MemoryRetentionPolicy` exposed on the runtime; **default = no rules = no expiry**
  (byte-stable). Actual scheduling stays a **seam** — the prune is invocable (config + route below), a
  cron/timer is deferred (mirrors the audit-retention seam).

### D2 — DSR export/delete (NFR-13) — `@tessera/api` (+ SDK, web mirror)
- **New audit actions** (`audit/model.ts`): `dsr.export`, `dsr.delete`, `retention.read`,
  `retention.manage`. (E-003 ripple: OpenAPI + SDK regen; E-020 web `AuditAction` mirror updated.)
- **DSR module** (`src/dsr/`): `buildDsrBundle(services, auditLog, tenantId)` → a complete JSON bundle
  `{ tenantId, exportedAt, memories (all versions), graph {nodes,edges}, sources, audit }`, all
  tenant-scoped; `purgeTenant(services, tenantId)` → deletes the tenant's memories (every lineage), graph
  (nodes+edges), and sources, returning per-domain counts. **Graph** gets `exportAll()` + `purge()` on
  the *service* only (delegating to existing `listNodes/listEdges/removeNode/removeEdges` — no
  `GraphStore` change). **Sources**/**audit** reuse existing `list`/`remove`/`query`.
- **Routes** (`routes/v1/dsr.ts`, `routes/v1/retention.ts`): `GET /v1/dsr/export`,
  `POST /v1/dsr/delete` (both `admin:manage`, audited `dsr.export`/`dsr.delete`); `GET /v1/retention`
  (effective policy, audited `retention.read`), `POST /v1/retention/prune` (runs the pass, audited
  `retention.manage`). Both routes take `services` + the injected `AuditLog` + the retention policy.
- **DSR delete retains the audit trail** (ADR-0049): erasure removes the *data plane* but the audit trail
  — the compliance record of the erasure — is retained (the `dsr.delete` event is itself recorded). This
  resolves the GDPR-erasure ↔ audit-retention tension; documented for operators.

### D3 — MCP-surface audit (closes F-027 seam) — `@tessera/mcp` + `@tessera/config`/`apps/server`
- **Gateway** (`gateway.ts`): an optional injected `AuditLog` (type-only import — MCP stays Fastify-free).
  A static `MCP_AUDIT_ACTIONS: Record<McpToolName, AuditAction>` maps every tool to an **existing** action
  (search→`search`, compile_context/explain→`compile`, get_effects/query_graph→`effects.read`,
  capture_memory→`memory.write`, assert_effect→`effects.write`, add_source/scan_source→`source.manage`,
  list_sources→`source.read`, list_tokens→`token.read`, issue/revoke_token→`token.manage`). The gateway
  records the **authorization decision** as the outcome: `success` when the call is authorized+metered,
  `denied` on a permission/quota failure (identity known). Unauthenticated calls (no identity → no tenant)
  are **not** audited — mirrors the REST hook skipping 401s. Recording is best-effort/failure-isolated.
- **Wiring** (`apps/server/src/mcp.ts`): pass `runtime.audit` to the gateway when present (default-on
  sqlite trail even in `none` mode, consistent with REST).

### Docs (NFR-13 posture)
- `docs/compliance/data-governance.md`: operator runbook for retention config, DSR export/delete
  (incl. the retain-audit posture), and the **encryption-at-rest posture** (SQLite: OS/FS-level or
  SQLCipher; Postgres: TDE / disk encryption; key handling via the `SecretsProvider`, never in the repo).
- **ADR-0049**: the three decisions (retention = delete/compact only; DSR-delete retains audit; MCP audit
  records the gateway decision reusing the existing taxonomy) + encryption-at-rest = deployment concern.

## Files to touch
- **memory:** `ports/memory-store.ts` (+3 methods), `adapters/in-memory-memory-store.ts`,
  `adapters/sqlite-memory-store.ts`, `service/memory-service.ts` (+prune/deleteLineage/exportAll),
  `service/retention.ts` (new), `index.ts` (+exports); `ports/conformance` + service/retention tests.
- **config:** `schema.ts` (+`memory.retention`), `profiles/local.ts` (resolve policy → runtime),
  `runtime.ts` (+`memoryRetention` policy field); tests.
- **api:** `audit/model.ts` (+4 actions), `dsr/bundle.ts` + `dsr/purge.ts` (new), `routes/v1/dsr.ts` +
  `routes/v1/retention.ts` (new), `routes/v1/index.ts` (+register, thread services/audit/policy),
  `server.ts` (+`memoryRetention?` option), `schemas/dsr.ts` + `schemas/retention.ts` (new),
  `knowledge-graph` service (`exportAll`/`purge`), `index.ts` (+exports); `tests/e2e/dsr.e2e.test.ts`.
- **mcp:** `gateway.ts` (+optional audit + tool→action map), `server.ts`/`stdio.ts` (thread the audit
  option through if needed), `apps/server/src/mcp.ts` (wire `runtime.audit`); `gateway.test.ts` +
  MCP e2e audit assertion.
- **sdk:** regenerate `openapi.json` + `generated/schema.ts`; `src/client.ts` (+`exportTenantData`/
  `deleteTenantData`/`getRetention`/`pruneRetention`); `tests/integration/sdk.test.ts`.
- **web:** `lib/api/types.ts` + `lib/governance.ts` — extend the `AuditAction` mirror with the 4 actions
  (+ labels) so typecheck/governance stays in lockstep.
- **docs:** `docs/compliance/data-governance.md` (new), `docs/adr/0049-*.md` (new); effects + progress.

## Anticipated effects
- **E-010** (memory): the `MemoryStore`/`MemoryService` gain delete/export + a retention pass.
- **E-003** (REST/MCP/SDK/web): new `/v1/dsr/*` + `/v1/retention/*` routes + 4 audit actions ⇒ OpenAPI
  + SDK regen + web mirror; MCP audit is additive (no tool signature change).
- **E-020** (audit): MCP tool calls now record events (closes the F-027 seam); 4 new actions; DSR/
  retention audited.

## Test plan
- **memory:** conformance for `deleteVersion`/`deleteLineage`/`exportAll` (incl. cross-tenant isolation);
  retention unit tests (expiry by age per kind/scope; superseded compaction by count/age; current version
  never mutated; deterministic clock; most-specific rule wins).
- **config:** `memory.retention` parses to a policy; default = empty policy (no expiry).
- **api e2e (`dsr.e2e.test.ts`):** seed a tenant (memories + graph + a source + audit) → `GET
  /v1/dsr/export` returns the complete bundle (all versions, graph, sources, audit) → `POST
  /v1/dsr/delete` empties the data plane but the delete event is in the audit trail → both require
  `admin:manage` (viewer 403, unauth 401) → cross-tenant: tenant B's data is untouched. `GET /v1/retention`
  returns the policy; `POST /v1/retention/prune` expires an over-age memory and is audited.
- **mcp e2e:** a gateway-guarded tool call records an event (actor/tenant/tool→action/`success`); a
  permission-denied call records `denied`; unauthenticated records nothing.
- **sdk integration:** the 4 methods round-trip against a real server.

## Verification
`node scripts/verify-state.mjs` · `pnpm -w typecheck` · `pnpm -w lint` · `pnpm -w format` ·
`pnpm -w test` · `pnpm -w test:e2e` · `pnpm -w build`. Capture task/test counts as evidence.

## Risks / open questions
- **Retention must never break the never-mutate contract** — the pass only deletes whole expired lineages
  and already-superseded versions; a kept lineage's current version is never touched. Covered by tests.
- **DSR delete vs audit retention** — resolved by ADR-0049 (erase data plane, retain the audit trail incl.
  the erasure event). Deleting the audit trail too is a documented, config-gated seam, not the default.
- **Graph completeness** — export uses `listNodes()/listEdges()` (unbounded) not `queryGraph` (capped), so
  the bundle is complete; purge clears edges then nodes.
- **MCP audit in `none` mode** — records under the local principal/default tenant, consistent with REST;
  best-effort so a sink error never fails a tool call.
- **No encryption-at-rest enforcement in-app** — it is a deployment/OS/DB concern; the posture + key
  handling are documented (NFR-13 asks the posture be *documented*, and secrets already flow via
  `SecretsProvider`).
