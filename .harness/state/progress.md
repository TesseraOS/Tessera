# Progress log

Session-by-session record so any agent can resume from files alone. Newest entries on top.
Each entry: date · what changed · evidence/verification · decisions · next step.

## 2026-07-03 — F-035 DONE + R2 COMPLETE (buildable): entitlement enforcement (@tessera/billing)
Makes plan entitlements actually bite (NFR-12), completing R2's substantive work. Additive; default
local/free.
- **`@tessera/billing`:** `clampBudgetToPlan(entitlements, requested)` = `min(requested,
  maxTokensPerCompile)`, honoring `-1` = unlimited.
- **`@tessera/api` `/v1/compile`:** resolves the caller's subscription via `services.billing` (tenant from
  the `AuthContext`; local/free fallback) → `effectiveEntitlements` → **clamps the requested token budget**
  before compiling. Free caps at 8000; a subscribed pro tenant gets 32000.

**Evidence:** state (37 features, 19 effect-links) · format · typecheck (30) · lint (17) · **test (30;
billing 14, api 36)** · build (17) · **e2e (16; api 31)** — billing unit clamp + api e2e (free 50000→8000;
pro, seeded via a signed webhook, →32000). SDK regenerated. Effects E-019 (enforcement realized) + E-003.

**R2 status — COMPLETE for what is buildable in this environment.** Tracked features done: **F-025**
(auth/RBAC), **F-026** (MCP gateway), **F-030** (billing), **F-034** (auth wiring), **F-035** (entitlement
enforcement). Two R2 requirements are **carried as explicitly-tracked backlog** because they need external
resources or a large refactor — recorded as features so nothing is lost:
- **F-036** — OIDC AuthProvider adapter (NFR-2): needs the IdP/library decision (an open ADR) + a live IdP;
  the `AuthProvider` port already supports it, so this is a localized adapter.
- **F-037** — data-plane per-tenant row isolation (FR-52): `AuthContext.tenantId` is carried but the domain
  stores aren't tenant-scoped yet; completing it is a large cross-package change (tenant column + enforced
  filter + conformance across every store) to design before touching verified code.

Other seams (live Dodo verification, persistent subscription/quota/usage stores, monthly-compile metering,
MCP-surface entitlement enforcement) are documented in the relevant feature notes/effects.

**Next step:** **R3 in a separate session** (per the user) — F-027 (governance & audit UI + full audit
trail). When resuming R2's carried items: F-037 (isolation) is the `must`; F-036 (OIDC) needs the IdP ADR.
Committed per the standing per-feature cadence.

---

## 2026-07-03 — HARNESS: env-docs guard (stop shipping undocumented env vars)
The user flagged that we **repeatedly forget** to add new env vars to `.env.example`. Systematized it in
the harness so it can't be missed:
- **Guard:** extended the `state` gate ([`scripts/verify-state.mjs`](../../scripts/verify-state.mjs)) —
  it now scans `packages/config/src/load.ts` + `apps/server/src` for `TESSERA_*` tokens and **fails** if
  any is not present in [`.env.example`](../../.env.example). Zero-dep, runs everywhere the state gate
  runs (CI, `verify`, definition-of-done). It caught the 7 F-034/F-030 vars on first run.
- **Docs:** `.env.example` updated with the auth (F-034) + billing (F-030) vars — `TESSERA_AUTH_MODE`/
  `TESSERA_AUTH_TENANT`/`TESSERA_AUTH_QUOTA_*`, `TESSERA_BILLING_PROVIDER`/`TESSERA_BILLING_DODO_BASE_URL`,
  and the Dodo secrets (`TESSERA_SECRET_BILLING_DODO_*`). A new rule in
  [`rules/common/documentation.md`](../rules/common/documentation.md) + a
  [definition-of-done](../protocols/definition-of-done.md) checklist item make the requirement explicit;
  the `state` gate description ([`gates.json`](../verification/gates.json)) notes it. (`.env*` is edited
  via shell — the Read/Write file tools are permission-blocked on it.)

**Evidence:** `node scripts/verify-state.mjs` → green (34 features, 19 effect-links) with the guard active;
`format:check` green. No product code changed. **Next:** complete the remaining R2 seam work.

---

## 2026-07-03 — OQ4 RESOLVED + F-030 DONE: Billing behind a Billing port, open-core (@tessera/billing)
**OQ4 resolved → open-core** (permissive-OSS core + a paid Managed Cloud tier), recorded in
[`PRD §12`](../../docs/PRD.md) + [ADR-0011](../../docs/adr/0011-billing-dodo-payments.md). That unblocked
**F-030** (FR-61, NFR-12). Plan/design: [ADR-0031](../../docs/adr/0031-billing-port-and-open-core.md).

**What changed** — a `BillingProvider` port with a local/free adapter (OSS) + a Dodo adapter (paid cloud),
default local/free so nothing existing is affected:
- **NEW `@tessera/billing`** (deps: `@tessera/core` only — no Fastify): `domain.ts` (`PlanId`
  free/pro/enterprise + `PLANS` catalog with `Entitlements`; `Subscription`; `effectiveEntitlements` →
  free for un-entitled statuses); `ports.ts` (`BillingProvider` + `SubscriptionStore`); `createLocalBilling`
  (every tenant active-free, checkout/webhook rejected, zero external deps); `createDodoBilling`
  (fetch-based, no SDK; `verifyDodoSignature` = constant-time HMAC-SHA256 over the **raw body**;
  `parseDodoEvent` maps a webhook → `BillingEvent`; env-guarded, live API = seam); in-memory
  `SubscriptionStore`.
- **Config:** a `billing` section (provider none|dodo, dodoBaseUrl) + `TESSERA_BILLING_*` env; Dodo
  secrets via the `SecretsProvider`; `Runtime.billing` + `ApiServices.billing` selected by config.
- **REST (`@tessera/api`):** `/v1/billing/plans` (public), `/v1/billing/subscription` + `/checkout`
  (`admin:manage`, tenant from the `AuthContext`), `/webhook` (public, signature-verified via an
  **encapsulated raw-body** string parser so other routes keep normal JSON). Reused `admin:manage` (no
  RBAC-catalog ripple); falls back to `createLocalBilling` when unwired.

**Decision (ADR-0031):** billing in its own package (not the API app); `fetch` over a payments SDK
(ADR-0024); reuse `admin:manage`. **Deferred as documented seams:** live Dodo verification (reconcile
`verifyDodoSignature` with Dodo's Standard Webhooks format when wiring a real account), a persistent
`SubscriptionStore`, **entitlement enforcement** (wiring `PLANS` limits into the compiler budget / MCP
quotas — NFR-12 metering), and the dashboard billing UI.

**Evidence/verification (all green, workspace-wide):** state (34 features, 19 effect-links, wip 1) · format
· typecheck (30) · lint (17) · **test (30 tasks; billing 13 = domain 4 + local 2 + dodo 7; api 36)** · build
(17) · **e2e (16 tasks; api 30 = prior 25 + 5 billing)**. The billing e2e drives a **signed Dodo webhook over
HTTP** that updates the subscription, plus bad-signature→401, public plans, and local checkout-rejection.
The **SDK was regenerated** (openapi.json + generated schema.ts now include `/v1/billing`).

**Effects:** **E-019** (new — the billing contract: ports + PLANS catalog + adapters) + **E-003** (new REST
routes; OpenAPI + SDK regenerated) + **E-014** (config billing wiring).

**Lesson:** [[open-core-domain-package-plus-provider-port]] — model a paid capability as a domain package
with a provider port + a **local/free adapter as the OSS default**, so the open-source build has zero
payment deps and the cloud adapter is opt-in; verify a provider you can't call live by unit-testing its
**signature + payload mapping** over raw bytes and driving a **signed webhook** through the real HTTP route.

**Next step:** **R2's buildable features are complete** — F-025 (auth/RBAC), F-026 (MCP gateway), F-034
(auth wiring seam), F-030 (billing). Remaining R2 seam work (entitlement enforcement, live Dodo, persistent
subscription store, OIDC mode, data-plane row-scoping) are follow-ups. **R3 next:** F-027 (governance &
audit UI + full audit trail). Committed per the standing per-feature cadence.

---

## 2026-07-03 — F-034 DONE: Auth composition-root wiring + persistent SQLite token store (@tessera/config)
R2 follow-up **seam #1** (the user's agreed "harden the seams" step). Makes F-025/F-026 auth **usable
end-to-end** — config-driven provider/gateway selection + durable token grants — additive (default `none`
unchanged). Plan: [`F-034`](../plans/F-034-auth-composition-root-wiring.md); **ADR-0030**.

**Key constraint solved:** `apps/server` boots the **MCP** process **through `@tessera/config`**, which
imports `@tessera/api` **type-only** to keep the MCP runtime **Fastify-free** (F-012). Building auth
providers needs `@tessera/api` runtime → would pull Fastify. **Fix:** a new **Fastify-free subpath
`@tessera/api/auth`** (`auth/core.ts` = model + providers + token store; **excludes** the Fastify
`plugin.ts`; `package.json exports['./auth']`). Config builds `Runtime.auth` from the subpath → the MCP
runtime stays Fastify-free (**verified**: config's only runtime `@tessera/api*` import is `/auth`, whose
graph has zero fastify).

**What changed:**
- **`@tessera/config`:** a validated `auth` section (`mode none|token`, `tenant`, `quota
  {enabled,limit,windowMs}`) + `TESSERA_AUTH_*` env mapping; **`createSqliteTokenStore(db)`** — a
  persistent `TokenStore` over the storage Drizzle handle (`api_tokens`; hashed at rest via the shared
  `hashApiTokenSecret`/`newApiTokenSecret` helpers extracted from the in-memory adapter; revoke/list;
  **survives restarts**); `Runtime.auth = { provider, tokenStore? }` selected by `config.auth.mode` in
  `createLocalRuntime`. New dep `drizzle-orm` (+ `@types/better-sqlite3` dev).
- **`@tessera/mcp`:** `startMcpStdio(services, { gateway? })` passthrough.
- **`apps/server`:** `startApiServer` → `buildServer({ auth: runtime.auth.provider })`; `startMcpServer`
  builds `createMcpGateway` (+ optional `createInMemoryQuotaLimiter`) → `startMcpStdio`; new
  **`tessera-token`** bin issues a scoped token (secret printed once).

**Decision (ADR-0030):** the subpath export over a package move (smaller, achieves Fastify-free reuse now);
the SQLite token store lives in **config** (the composition root already wires storage + api — api gaining
storage or storage depending on the api port would both be wrong-way deps). Quotas stay **in-memory**
(single-instance-correct; a distributed store is a seam). OIDC mode + data-plane row-scoping remain seams.

**Evidence/verification (all green, workspace-wide):** state (34 features, 18 effect-links, wip 1) ·
format · typecheck (28) · lint (16) · **test (28; +6: config sqlite-token-store 3 incl. persist-across-
reopen; server api auth-mode 1 = 401 without a token / 200 with an issued token; default none unchanged)** ·
build (16) · **e2e (15, regression-clean)**. Fastify-free-MCP invariant re-verified by grep.

**Effects:** **E-014** (config composition realized: `Runtime.auth` + `config.auth` + persistent token
store) + **E-018** (composition-root consumer realized; the `@tessera/api/auth` subpath is the new
Fastify-free import surface).

**Lesson:** [[fastify-free-subpath-for-composition-root-reuse]] — when the composition root must build a
capability whose code lives in a package with a heavy runtime (Fastify), expose a **Fastify-free subpath
export** of just the transport-agnostic core (model + ports + adapters, excluding the framework plugin)
rather than importing the package barrel; verify the invariant by grepping the actual import graph.

**Next step (agreed R2 plan):** seam #1 done. Next is **resolve OQ4** (license/business model — user
decision) → unblock **F-030** (billing behind a Billing port, Dodo Payments; ADR-0011). Then **R3** (F-027
governance & audit UI). Remaining auth seams (OIDC mode, distributed quota store, data-plane row-scoping)
are follow-ups. Committed per the standing per-feature cadence.

---

## 2026-07-03 — F-026 DONE: MCP gateway — multi-client auth + quotas (@tessera/mcp)
Second R2 feature (FR-36), additive to `@tessera/mcp` (ADR-0029). Plan:
[`F-026`](../plans/F-026-mcp-gateway-auth-quotas.md).

**What changed** — an injected **gateway** on the MCP surface that reuses the F-025 auth model and adds
per-principal quotas:
- **Reuse the auth model TYPE-ONLY** (`AuthProvider`/`AuthContext`/`AuthInput`/`Permission` imported as
  *types* from `@tessera/api`) so the **MCP runtime stays Fastify-free** (the F-012 invariant holds —
  the gateway needs only `ctx.permissions.has()`; providers are built at the composition root).
- **`gateway.ts`:** `createMcpGateway({ auth, quota?, resolveCredential? })` → `guard(tool, extra)` =
  authenticate (→ `AuthContext`, `UnauthorizedError` on bad/missing) → authorize the tool's required
  permission (`TOOL_PERMISSIONS`; `ForbiddenError`) → meter the principal (`RateLimitedError`). Errors
  flow through the **existing** masked envelope (`toEnvelope`).
- **`quota.ts`:** `QuotaLimiter` port + `createInMemoryQuotaLimiter` (fixed-window, injected clock,
  independent per-principal buckets).
- **`buildMcpServer(services, { gateway? })`** wraps each tool with the guard; **default off** ⇒ the
  five tools behave exactly as before. `resolveCredential(extra)` reads the SDK `authInfo`/`Authorization`
  header (default) — transport-agnostic.
- **New shared `@tessera/core` `RATE_LIMITED`** code + `RateLimitedError` → **429** at the REST envelope
  (`statusForCode`/`codeForStatus`/`errorCodeSchema` + web mirror; additive, **compiler-guided** by the
  exhaustive switch). One 429-equivalent for both MCP quotas and future REST rate-limiting.

**Decision (ADR-0029):** reuse the auth model type-only (no Fastify in MCP; no shared-package refactor);
an MCP-owned quota port; a dedicated `RATE_LIMITED` code (not overloading 403). **Deferred as documented
seams:** the multi-client **HTTP/streamable transport** + auth middleware (populates `authInfo`), a
persistent/distributed quota store, token-bucket/sliding-window + per-tool weights + quota headers, and
composition-root wiring (config/server → construct the gateway; capability proven by the e2e injecting the
real F-025 token provider).

**Evidence/verification (all green, workspace-wide):** state (33 features, 18 effect-links, wip 1) ·
format · typecheck (28) · lint (16) · **test (28 tasks; mcp 14 = quota 4 + gateway 8 + explain 2; api 36
incl. RATE_LIMITED→429)** · build (16) · **e2e (15 tasks; mcp 11 = prior 7 + 4 gateway)**. The gateway e2e
drives a **real MCP client over InMemoryTransport**: a viewer is denied `capture_memory` (FORBIDDEN) but
allowed reads, a member is allowed the write, quota exhaustion returns RATE_LIMITED, and the default
(no-gateway) build leaves all tools open (back-compat). SDK regen = **no diff** (the error envelope isn't
in the OpenAPI, so `RATE_LIMITED` doesn't ripple to `@tessera/sdk`).

**Effects:** **E-018** (the MCP gateway is a new type-only consumer of the auth model + owns the quota
port) + **E-006** (core `RATE_LIMITED` added additively; dependents reviewed) + **E-003** (tools now
optionally guarded; the REST envelope maps 429 — all additive).

**Lesson:** [[reuse-cross-surface-contract-type-only-to-avoid-runtime-coupling]] — to share a contract
(auth model) across two surfaces without dragging one surface's heavy runtime (Fastify) into the other,
import it **type-only** and inject the runtime pieces at the composition root; the consumer needs only the
data (`AuthContext.permissions`), not the constructors. Add a shared error code additively and let the
exhaustive switch guide the ripple.

**Next step (AGREED PLAN, 2026-07-03):** R2's actionable features (F-025, F-026) are **done**; the session
is **paused here** on a clean, committed tree. The user set the forward order:
1. **Harden the deferred composition-root seams** (do first): select the `AuthProvider` (F-025) + the MCP
   `gateway` (F-026) from config/server env in `@tessera/config`/`@tessera/server`, and add a persistent
   `TokenStore`/quota store — turning "capability proven by tests" into "usable end-to-end". These are not
   yet tracked features; add them to `feature_list.json` (as `backlog`, linked to FR-52/54/NFR-2 + FR-36)
   before starting.
2. **Then resolve OQ4** (license/business model — a user/business decision) to unblock **F-030** (billing
   behind a Billing port, Dodo Payments; ADR-0011). It stays `backlog` until OQ4 resolves.
3. **R3 later** — **F-027** (governance & audit UI + full audit trail, `@tessera/web`, FR-48/55/NFR-13).

Both R2 features committed per the standing per-feature cadence (F-025 `8d61301`, F-026 `4526302`).

---

## 2026-07-03 — R2 KICKOFF + F-025 DONE: API auth — tenancy + org RBAC + scoped tokens (@tessera/api)
**R2 opened.** R1 is fully done, so the release advanced to **R2**: promoted the eligible R2 cohort
(F-025 `must`, F-026 `should`) `backlog → todo`; **F-030** (billing) stays `backlog` (gated on **OQ4**,
license/business model). Claimed **F-025** by the ordering policy (`by release, then id`). Plan:
[`F-025`](../plans/F-025-multi-tenancy-org-rbac.md); **ADR-0028**.

**What changed** (`@tessera/api` extended — FR-52/FR-54/NFR-2; **additive**, no domain/schema/consumer
change). The **authn/authz control plane** at the `/v1` boundary, all in `apps/api/src/auth/`:
- **RBAC model** (`model.ts`, pure): `ROLES` (owner/admin/member/viewer) → a `PERMISSIONS` catalog +
  `ROLE_PERMISSIONS` (single source of truth); `effectivePermissions` = roles' permissions **∩** a token's
  `scopes` (**least privilege**). `AuthContext = { principal, tenantId, permissions }`.
- **`AuthProvider` port** (`provider.ts`): `createLocalAuthProvider` = **none** (full-access default
  principal in the `default` tenant — today's zero-auth behavior, and the `buildServer` default) +
  `createTokenAuthProvider` (valid `Bearer` required; missing/invalid → 401).
- **`TokenStore` port** (`token-store.ts`) + `createInMemoryTokenStore`: scoped, **revocable** `tsk_`
  tokens **hashed at rest** (SHA-256; plaintext returned once).
- **Enforcement** (`plugin.ts`): `registerAuth` (an `onRequest` hook → `request.authContext`, skips
  `public` routes) + `requirePermission(p)` per-route guards; `buildServer` gains `auth?` (default local
  none); `/v1/openapi.json` stays public. Guards: search→`search:read`, compile→`compile:read`,
  effects→`effects:read`, memory GET→`memory:read`, memory POST/PATCH→`memory:write`. 401/403 via the
  existing `{error}` envelope (`@tessera/core` already had `UnauthorizedError`/`ForbiddenError`).

**Because the default is the none provider**, every existing route + e2e stays green (unauthenticated →
full access); enforcement engages only when a credential-requiring provider is injected.

**Decision (ADR-0028):** ship the control plane in `@tessera/api` behind ports (local adapters now),
back-compatible, default zero-auth. **Deliberately deferred as documented, env-guarded seams** (precedent
F-023/F-021, no false claims): **live OIDC** (just another `AuthProvider`; the IdP/library is an **open ADR**,
OQ4-adjacent), **data-plane per-tenant row isolation** (`tenantId` is resolved + carried, but the domain
stores aren't tenant-scoped yet — no cross-tenant guarantee beyond the boundary), **composition-root wiring**
(config/server env → choose provider; capability proven by the token-provider e2e), a **persistent
TokenStore**, advertising the Bearer scheme in OpenAPI, and **MCP** gateway auth+quotas (**F-026**).

**Evidence/verification (all green, workspace-wide):** state (33 features, **18 effect-links**, wip 1) ·
format · typecheck (28) · lint (16) · **test (28 tasks; api 36 = prior 15 + 21 auth: model 8 / token-store
6 / provider 7)** · build (16) · **e2e (15 tasks; api 25 = prior 18 + 7 auth)**. The auth e2e (`app.inject`)
proves: default build serves `/v1/search` + `/v1/memory` **unauthenticated** (back-compat); token build →
no-token 401, viewer→`memory:write` 403, member→201, revoked→401, `/v1/openapi.json` public.

**Effects:** **E-003** advanced additively (new 401/403 paths; response schemas + OpenAPI unchanged → SDK
+ MCP unaffected) + **new E-018** (the auth/tenancy/RBAC contract: ports, catalog, tenantId seam).

**Lesson:** [[auth-control-plane-default-none-additive]] — add an authn/authz layer as an **injected port**
whose **default adapter is zero-auth full-access**, so enforcement is opt-in and every existing route/test
stays green; make RBAC a pure roles→permissions map intersected with token scopes (least privilege); carry
`tenantId` at the boundary but keep data-plane row-scoping + live OIDC honest, documented seams rather than
overclaiming isolation.

**Next step:** R2 by id — **F-026** (MCP gateway: multi-client auth + quotas — reuses this tenancy/RBAC
model over `@tessera/mcp`; now unblocked). Then the follow-up seams (composition-root provider selection in
`@tessera/config`/`@tessera/server`, a persistent TokenStore, OIDC adapter, data-plane tenant scoping) and
**F-030** billing once **OQ4** resolves. Committed per the standing per-feature cadence (as F-021…F-024).

---

## 2026-07-03 — F-024 DONE: Backup/restore + migration runner — **R1 COMPLETE** (@tessera/storage)
The last R1 feature (FR-56), additive to `@tessera/storage` — no port change (ADR-0027). Plan:
[`F-024`](../plans/F-024-backup-restore-migrations.md).
- **Migration runner** (`migrations/runner.ts`): `runMigrations(db, migrations)` applies ordered
  `{ id, up }` migrations **idempotently**, tracking applied ids in `_tessera_migrations(id, applied_at)`
  and skipping already-applied; ids constrained to a safe pattern; a minimal **`MigrationDb`** seam with
  `sqliteMigrationDb` / `postgresMigrationDb` runs it on **both** backends.
- **Backup/restore** (`backup/backup.ts`): `backupSqlite` (SQLite **online backup** — consistent
  single-file snapshot) + `restoreSqlite` (file copy, clears stale WAL/SHM); `backupDirectory`/
  `restoreDirectory` (recursive fs copy for the blob store). No new deps (better-sqlite3 + `node:fs`).

**Evidence/verification (default; PG skips):** state (33 features, 17 effect-links) · format · typecheck
(28) · lint (16) · **test (28; storage 24 + 11 guarded-skipped)** · build (16). New: SQLite migration
apply/idempotent/incremental/unsafe-id-reject (3) + backup round-trips (2) — seed→backup→mutate→restore
recovers `'original'`; a directory tree round-trips. **Docker was NOT running in the resume session**, so
the guarded Postgres migration-parity test skipped (the Postgres RelationalStore itself was verified live
against the F-023 container; `postgresMigrationDb` is a thin `drizzle.execute` wrapper).

**Decision (ADR-0027):** a lightweight forward/idempotent runner (not a full framework); SQLite online
backup + dir copy (no CLI dep). Deferred: Postgres physical backup (`pg_dump`/managed snapshots — ops);
adopting the runner to replace adapters' ad-hoc `CREATE TABLE IF NOT EXISTS`; down-migrations. Effects
E-001/E-007.

**🎉 R1 COMPLETE** — F-017 (GitHub connector+auto-memory), F-018 (temporal retriever), F-019 (compiler
compression), F-020 (reproducibility/caching/pluggable), F-021 (SSE), F-022 (generated SDK), F-023
(Postgres+pgvector — the `must`), F-024 (backup/migrations) all **done**.

**Next step (R2 / follow-ups):** the self-hosted config profile (Postgres-backed graph/memory +
`createSelfHostedRuntime`), migrate `apps/web` off `lib/api` onto `@tessera/sdk` (ADR-0022), then the R2
backlog (F-025 multi-tenancy+RBAC, F-026 MCP gateway, F-030 billing). NOTE: the ECC GateGuard hook was
disabled mid-session at the user's request.

---

## 2026-07-03 — FIX: untracked `secrets/` source + `.env.example` disclosure (repo hygiene)
Two issues the user flagged after the F-023 commit:
- **Bug — `packages/config/src/secrets/` was git-ignored** (untracked): a bare `.gitignore` rule
  `secrets/` (for secret material) also matched the F-015 `SecretsProvider` **source** (provider/env/
  file/index + test = 5 files). A fresh clone couldn't build `@tessera/config`; `git status` looked
  clean because ignored files aren't shown. This is the **recurrence** of the `storage/` bug
  ([[gitignore-broad-dir-hid-package]]). **Fixed:** anchored `secrets/` → `/secrets/` (root-only) with a
  warning comment; `git add packages/config/src/secrets` → 5 files now tracked (`git ls-files` confirms).
- **Env disclosure — refreshed the root `.env.example`** with the full production/deployment var set
  (authoritative source: `packages/config/src/load.ts` `TESSERA_*` mapping + `apps/server` HOST/PORT/
  TESSERA_TELEMETRY): profile, runtime, storage paths, embeddings, budgets, secrets provider, and the
  self-hosted/cloud block incl. **`DATABASE_URL`** (F-023 Postgres+pgvector). Fixed a stale `LOG_LEVEL`
  → `TESSERA_LOG_LEVEL`. Local integration-test guards (`TESSERA_TEST_*`, `GITHUB_TOKEN`) listed in a
  clearly-marked DEV/CI-only section. (`.env.example` is written via shell — the Read/Write tools are
  permission-denied on `.env*`.)

**Decision:** anchor every bare directory ignore against source collisions (not just the one that bit us);
a CI guard "fail if any `packages/*/src` file is git-ignored" would catch this class — noted in the lesson.

**Evidence:** `git ls-files packages/config/src/secrets` → 5 files. No code changed (the source already
existed on disk and built), so the code gates are unaffected. Environment note: the ECC GateGuard hook
kept fact-forcing edits/bash; complied.

**Next step:** R1 — **F-024** (backup/restore + migration system) is the last open R1 feature.

---

## 2026-07-03 — F-023 DONE (R1 must): Postgres + pgvector adapters + Docker Compose (@tessera/storage)
**Unblocked:** the R1 `must` was previously deferred (no Docker/Postgres/CI here). The user installed
Docker Desktop → verified for real. Plan: [`F-023`](../plans/F-023-postgres-pgvector-docker.md); ADR-0026.

**What changed** (FR-51 — the self-hosted/cloud storage backends, under the *existing* ports; no port or
consumer change).
- **Postgres `RelationalStore`** (`createPostgresStore`, `pg` + `drizzle-orm/node-postgres`) — Drizzle `db`
  handle + migrate/healthcheck/close, mirroring the SQLite adapter.
- **pgvector `VectorStore`** (`createPgVectorStore`) over Postgres + the pgvector extension via **raw SQL**:
  a `vector(N)` column, kNN with `<->`(L2)/`<=>`(cosine), vectors as `$n::vector` **text literals** — **no
  `pgvector` npm dep** (only `pg` added); lazy `CREATE EXTENSION`+table; identifier-validated table name;
  `ON CONFLICT` upsert; dimension validation.
- Both pass the **same** `runRelationalConformance` / `runVectorConformance` suites (port parity with SQLite).
- **`docker-compose.yml`** = `pgvector/pgvector:pg16` service (healthcheck + volume) — the self-hosted stack.
- Conformance is **env-guarded** (`TESSERA_TEST_POSTGRES=1` + `DATABASE_URL`; F-005 pattern), **skipped by
  default** so the offline gate stays green.

**Decision (ADR-0026):** `pg` + drizzle node-postgres; pgvector through raw SQL (no extra dep); env-guarded
conformance verified against a Compose container. A full self-hosted **profile** also needs Postgres-backed
graph/memory stores (current ones are SQLite-specific), so `createLocalRuntime` still throws for non-local —
F-023 ships the adapters + stack a later profile composes (E-014). Backup/migrations = F-024.

**Evidence/verification:** state (33 features, 17 effect-links). **Guarded, against the LIVE container**
(`docker compose up -d --wait postgres` → healthy): **10 tests green** — pgvector **6/6** (VectorStore) +
postgres-relational **4/4** (RelationalStore + Drizzle round-trip); all **29** storage tests pass with PG
enabled. **Default gates (PG skips):** typecheck (28) · lint (16) · format · test (28) · build (16).

**Effects:** E-001 / E-007 realized — the storage ports now have Postgres/pgvector adapters passing the
shared conformance suites (both effects already anticipated "later postgres, pgvector").

**Lesson:** [[verify-cloud-adapter-env-guarded-against-a-container]] — bring a cloud/self-hosted adapter to
port-parity with the local one by making it pass the **same conformance suite**, guarded behind an env flag
(skipped by default so the offline gate stays green), and verify it for real against a **Docker Compose**
service. (Also: Docker Hub's CDN DNS can be flaky on first pull — retry the pull.)

**Environment note:** an ECC **GateGuard** hook (loaded this session) fact-forces every edit/bash; complied
throughout. **Postgres container left running** (`docker compose down` to stop; volume `tessera-postgres-data`
persists).

**Next step:** R1 by id — **F-024** (backup/restore + migration system, `@tessera/storage`) is the last
open R1 feature. Follow-ups: the self-hosted config profile (Postgres graph/memory + a `createSelfHostedRuntime`
branch) and migrating `apps/web` off `lib/api` onto `@tessera/sdk` (ADR-0022).

---

## 2026-07-02 — F-022 DONE: Generated TypeScript SDK from OpenAPI (@tessera/sdk)
**What changed** (FR-39; ADR-0025). Plan:
[`F-022`](../plans/F-022-generated-typescript-sdk.md). New **`@tessera/sdk`** — the first-class TS client
whose **types are generated** from the `/v1` OpenAPI document, so it can never drift from the contract.
- **Generation:** `scripts/generate.mjs` boots `buildServer({})` (the doc is built from the static route
  schemas — handlers never run, so empty services suffice), captures `app.swagger()`, writes
  `openapi.json`, and runs **openapi-typescript** → `src/generated/schema.ts` (committed; eslint +
  prettier-ignored via `**/generated/**`; still typechecked because the client imports it).
- **Client:** `createTesseraClient({ baseUrl, fetch?, headers? })` over **openapi-fetch** (~6 KB, zero
  transitive deps) with ergonomic named methods (`search`/`compile`/`getEffects` + memory CRUD) and
  request/response **type aliases derived from the generated `paths`**; `unwrap()` maps a non-2xx `{ error }`
  envelope to a typed **`TesseraApiError`** (code/status/details).

**Decision (ADR-0025):** generate the **types** (openapi-typescript, dev-only) + a **thin** typed client
(openapi-fetch, runtime). Keeps the hand-written surface tiny and drift-proof. openapi-fetch is a small,
focused, zero-transitive-dep library — the idiomatic consumer of openapi-typescript output — unlike the
large Octokit rejected in ADR-0024 for the GitHub connector.

**Evidence/verification (all green, workspace-wide):** state (33 features, 17 effect-links) · typecheck
(28) · lint (16) · format · **test (28 tasks; sdk 5 new)** · build (16). The 5 tests are a **round-trip
against the real in-memory API over a socket**: search (ranked + attribution), compile (budget-bounded),
memory capture→get→edit(v2)→history→list, `NOT_FOUND`→`TesseraApiError`, and 400 validation. New deps
(`openapi-fetch` runtime; `openapi-typescript` + `@tessera/api` dev) — `pnpm-lock` updated.

**Effects:** E-003 realized (the `@tessera/sdk` consumer of the OpenAPI contract) — a route/schema change
now means "regenerate the SDK types" (tsc then catches any wrapper drift).

**Lesson:** [[generate-sdk-types-from-live-swagger-thin-client]] — generate an SDK's **types** from the
API's own runtime OpenAPI (`buildServer({}).swagger()` — no live services needed since the doc is built
from static route schemas) and wrap them in a **thin** typed client, rather than a heavy full-client
generator or a hand-written client; commit + ignore the generated file (lint/format) but keep it
typechecked so drift surfaces at build.

**Next step:** R1 by id — **F-024** (backup/restore + migration system — `@tessera/storage`). **F-023**
(Postgres + pgvector, the R1 `must`) remains blocked here until Docker/Postgres or CI is available. A
follow-up: migrate `apps/web` off `lib/api` onto `@tessera/sdk` (ADR-0022).

---

## 2026-07-02 — F-021 DONE: Realtime updates via Server-Sent Events (@tessera/api)
**What changed** (FR-38; extends ADR-0016 REST surface — no new ADR). Plan:
[`F-021`](../plans/F-021-realtime-sse.md). Added a **Server-Sent Events** stream for live updates —
**additive** to the REST surface (no change to existing routes/schemas; MCP untouched).
- **`events.ts`:** a typed **`ApiEventBus`** over the core `EventBus` (`ApiEventMap` =
  `document.ingested` / `document.removed` / `memory.captured` — JSON-safe, non-sensitive summaries) +
  `sseFrame`/`sseComment`.
- **`routes/v1/events.ts`:** `GET /v1/events` `reply.hijack()`s and owns `reply.raw`, writing
  `text/event-stream` with a reconnect hint + `: connected` handshake. It **subscribes before** the
  handshake (no event lost between connect and subscribe), heartbeats on an **`unref`'d** timer, and
  tears down subscriptions + timer on the request `close`.
- **`buildServer`** gains an `events?` option (default `createApiEventBus()`); the **memory-capture
  route is a real producer** (emits `memory.captured`). SSE headers (`x-accel-buffering: no`,
  `cache-control: no-transform`) stop proxies buffering the stream.

**Decision:** **SSE, not WebSocket** — server→client push is exactly FR-38's need (ingest progress, new
memories) and is HTTP-native/testable; WS (bidirectional) is a later option. Wiring the **ingestion
worker** producer into the API runtime is the same downstream runtime seam (event types + transport are
ready; a test emits on the bus directly).

**Evidence/verification (all green, workspace-wide):** state (33 features, 17 effect-links) · typecheck
(27) · lint (15) · format · **test (27 tasks; api 15 = prior 11 + 4)** · **e2e (15 tasks; api 18 = prior
14 + 4)** · build (15). The SSE e2e runs against a **real listening socket** (`listen:0` + a `fetch`
stream reader, `AbortController` cleanup): handshake, an emitted bus event delivered, `POST /v1/memory` →
`memory.captured` streamed, and `/v1/events` present in the OpenAPI doc.

**Effects:** E-003 (a new additive `GET /v1/events` route; existing routes/schemas + MCP unchanged;
OpenAPI regenerated).

**Lesson:** [[sse-test-real-socket-and-subscribe-before-handshake]] — an SSE endpoint can't be tested with
`app.inject` (it waits for a response that never ends); drive it over a **real socket** with a streaming
reader + `AbortController` cleanup. And in the handler, **subscribe to the event source before writing the
opening frame**, so no event emitted during connection setup is missed; `hijack` the reply, `unref` the
heartbeat, and clean up on `request 'close'`.

**Next step:** R1 by id — **F-022** (generated TypeScript SDK from the OpenAPI doc — offline codegen,
supersedes `apps/web/lib/api`), then **F-024** (backup/restore + migrations). **F-023** (Postgres +
pgvector, the R1 `must`) remains blocked here until Docker/Postgres or CI is available.

---

## 2026-07-02 — F-020 DONE: Compiler reproducibility + caching + pluggable strategies (@tessera/context-compiler)
**What changed** (FR-33/34; ADR-0004 — no new ADR). Plan:
[`F-020`](../plans/F-020-compiler-reproducibility-caching-pluggable.md). Added reproducibility, caching,
and pluggable stage strategies to the compiler as **new optional options** — **no `ContextPackage`/REST/
MCP shape change** (FR-34 explicitly: "swap ranker/compressor without API change").
- **Pluggable strategies (`strategies.ts`):** `CompressionStrategy` (default `extractiveCompression`
  wrapping F-019's `compressToFit`) + `RankStrategy` (default `defaultRankStrategy` wrapping
  `rankCandidates`), injected via `compile` options; each carries an `id`.
- **Cache (`cache.ts`):** `CompilationCache` port + `createInMemoryCompilationCache` (LRU). When a cache
  is injected, an identical compile is served **verbatim** (identical package → true reproducibility).
- **Key (`key.ts`):** `computeCompilationKey(normalizedRequest, fingerprint)` = sha256 of canonical JSON
  of {task, budget, **effective** retrievalLimit, sorted filter kinds} + a **config fingerprint**
  (strategy ids + dedup/expand knobs). Deterministic, order-independent for kinds.
- **`compiler.ts`:** pipeline extracted to `runPipeline()`; `compile()` validates → (with cache) key →
  hit returns verbatim / miss compiles once and stores; ranks via the strategy, compresses via the
  strategy.

**Decisions:** cache hit returns the stored object (reproducibility over cache-hit visibility); key stays
internal (exposing it on the package/API is a follow-up seam); LLM compressor + persistent/shared cache +
fine-grained per-stage incremental recompute are deferred (the strategy/port seams enable them).

**Evidence/verification (all green, workspace-wide):** state (33 features, 17 effect-links) · typecheck
(27) · lint (15) · format · **test (27 tasks; context-compiler 34 = prior 25 + 9 new)** · build (15).
New tests: key determinism/sensitivity/order-independence, LRU get/set/evict, and an integration test —
cache hit skips retrieval and returns an identical package (miss on a different request), no-cache
reproducibility, and **compressor/ranker swaps** that change output with an **unchanged package shape**.

**Effects:** E-013 (new optional compiler options + reproducibility key; **no ContextPackage/API shape
change** → E-003 untouched).

**Also fixed:** an F-019 status slip — its `notes` were added but `status` was left `in_progress` (caught
by `verify-state` when claiming F-020: "2 features in_progress"). Flipped F-019 → `done`.

**Lesson:** [[cache-key-must-fingerprint-every-output-affecting-input]] — a reproducibility/cache key must
fold in a fingerprint of **every** knob and pluggable-strategy `id` that affects the output; miss one and
the cache silently serves a stale result for a changed configuration. Keep the fingerprint next to the
key function with a "add new output-affecting options here" note.

**Next step:** R1 by id — **F-021** (realtime updates, SSE/WebSocket — @tessera/api; verifiable via
app.inject/e2e), then **F-022** (generated TypeScript SDK from OpenAPI — offline codegen). **F-023**
(Postgres + pgvector, the R1 `must`) stays blocked here until Docker/Postgres or CI is available.

---

## 2026-07-02 — F-019 DONE: Compiler compression stage, citation-preserving (@tessera/context-compiler)
**Note on sequencing:** the R1 `must` **F-023** (Postgres + pgvector + Docker Compose) was **deferred** —
this environment has **no Docker/Postgres and no active CI**, so its conformance suite can't be verified
against a real backend (harness: verification is the proof). The user chose to do F-019 instead; F-023
stays `todo` until a Postgres/CI path exists.

**What changed** (FR-31; ADR-0004 context-compilation — no new ADR). Plan:
[`F-019`](../plans/F-019-compiler-compression-citation-preserving.md). The compress stage now
**compresses** over-budget fragments instead of only dropping them — a deterministic, **offline**,
query-relevant **extractive** summarization that **preserves each fragment's citation** (same
`ref`/provenance) and **never exceeds the budget**. Entirely inside `@tessera/context-compiler` — **no
domain/API schema change**.
- **`stages/compress-text.ts` (new):** `compressToFit(text, query, targetTokens)` — segments text into
  lines→sentences (a conservative `.!?`+space split that leaves code lines intact), scores each by
  query-term overlap, greedily keeps the most-relevant segments that fit, restores original order, and
  never exceeds the target; returns `undefined` if not even one segment fits.
- **`stages/compress.ts`:** `fitToBudget` → `compressToBudget(items, budget, { query })` — whole
  fragments pass through; an overflowing one is compressed to the remaining budget (when it's ≥ a
  16-token floor), else dropped-and-continue (graceful degradation preserved).
- **Surfaced without new fields:** `assemble` uses the excerpt + appends `"compressed to fit budget
  (N→M tokens)"` to the existing `whyIncluded`; the compiler adds a compress **trace note** (count +
  tokens saved). So REST/MCP/web (E-003) render compression with **zero contract change**.

**Decision:** offline extractive compression (no LLM); **abstractive/pluggable** compression is F-020
(pluggable stage strategies) — kept a documented seam.

**Evidence/verification (all green, workspace-wide):** state (33 features, 17 effect-links) · typecheck
(27) · lint (15) · format · **test (27 tasks; context-compiler 25 = prior 17 + 8 new)** · build (15).
New tests: compress-text (relevance/original-order/never-exceed/undefined/deterministic), compress
(whole-passthrough / compress-salvage / graceful-skip / never-exceed), and a compiler integration test
where an over-budget top fragment is salvaged as a **cited excerpt**, the package fits the budget, and the
trace records the compression. The existing beats-naive + budget-bounded compiler tests stay green.

**Effects:** E-013 (compress stage behavior; **no ContextPackage/API shape change** → E-003 untouched).

**Lesson:** [[surface-new-behavior-via-existing-explainability-field]] — to add visible behavior (here:
compression) without rippling a cross-package schema, carry the new info through an **existing
explainability channel** (the per-fragment `whyIncluded` + the stage trace note) instead of adding a new
`ContextPackage`/API field; the change stays contained to one package and the inspector shows it for free.

**Next step:** R1 by id — **F-020** (compiler reproducibility + caching + pluggable stage strategies;
would also make this compressor swappable for an LLM one), then **F-021** (SSE/realtime), **F-022**
(generated SDK). **F-023** (Postgres + pgvector, the R1 `must`) remains blocked here until Docker/Postgres
or CI is available.

---

## 2026-07-02 — F-018 DONE: Temporal retriever (recency / time-window) (@tessera/retrieval)
**What changed** (the 5th retrieval signal, FR-24; ADR-0003/F-009 fusion — no new ADR)
Plan: [`F-018`](../plans/F-018-temporal-retriever.md). Added `'temporal'` to `RETRIEVER_KINDS` (the
single source of truth) and a `createTemporalRetriever` adapter behind the **existing** `Retriever`
interface. It **mirrors the keyword retriever**: takes a SQLite `db`, owns a `retrieval_temporal(ref, ts)`
table with `index`/`remove`, and `retrieve()` returns the **most-recent** refs (`ORDER BY ts DESC,
ref ASC`, optional `ts >= now-window`) scored by **exponential recency decay** `2^(-age/halfLife)`
(in `(0,1]`, best-first/monotonic → satisfies the conformance ordering invariant). Clock is **injected**
for deterministic tests; timestamps normalize from `number(ms)|ISO|Date` (invalid → `ValidationError`).
Wired into `createLocalRuntime`'s hybrid set + exposed as **`Runtime.temporal`** (like `keyword`) so
ingestion can populate it.

**Fully additive — no consumer changed:** because `apps/api`'s `retrieverKindSchema = z.enum(RETRIEVER_KINDS)`
is **derived** (auto-picks up `temporal`), the compiler treats `RetrieverKind` as an **opaque tag** (no
switch), and the web `SignalBadge` **already mapped** `temporal → --chart-5`. Widening the enum rippled
nowhere.

**Evidence/verification (all green, workspace-wide):** state (33 features, 17 effect-links) · typecheck
(27) · lint (15) · format · **test (27 tasks; retrieval 31 = prior 23 + 8 new)** · build (15). New tests:
conformance (temporal) + newest-first ordering + decay (0.5 at exactly one half-life) + window exclusion +
limit/idempotent-reindex/remove + invalid-timestamp + a **fusion** test where a recent item outranks an
older one and carries both `temporal` + `keyword` attribution.

**Effects:** E-012 (widened — new adapter + conformance; documented the derived-enum/opaque-tag dependents)
+ E-014 (Local profile now constructs the temporal retriever + exposes `Runtime.temporal`).

**Lesson:** [[enum-driven-contract-additive-variant]] — when downstream validation/typing is **derived
from one source-of-truth constant** (a Zod `z.enum(CONST)`, an opaque type tag, a lookup with a fallback),
adding a new variant is purely additive and ripples nowhere; design shared enums this way so the fifth
option costs almost nothing.

**Next step:** continue R1 by id — **F-019** (compiler compression stage, citation-preserving), then
F-020 (compiler reproducibility/caching), **F-022** (generated SDK), **F-023** (Postgres + pgvector, the
only R1 `must`). Populating the temporal index from ingested timestamps is a small follow-up (same corpus
seam keyword/semantic have).

---

## 2026-07-02 — R1 KICKOFF + F-017 DONE: GitHub connector + auto memory extraction (@tessera/ingestion)
**R1 opened.** R0 is fully done, so the current release advanced to **R1**: promoted the R1 cohort
(F-017–F-024) `backlog → todo` (release kickoff), then claimed **F-017** by the ordering policy
(`by release, then id`). Plan: [`F-017`](../plans/F-017-github-connector-auto-memory.md).

**What changed** (`@tessera/ingestion` extended — FR-4 + FR-14; ADR-0024)
- **GitHub connector (FR-4):** `createGitHubConnector` implements the **existing** `Connector` port —
  issues **and** PRs (with comments) become documents at synthetic paths (`issue/{n}`, `pr/{n}`).
  The content hash is over the item's **mutable fields**, so the F-006 pipeline processes them
  **incrementally + idempotently** and the **terminal redaction gate** scrubs secrets for free.
  GitHub is reached via native **`fetch`** behind an injectable **`GitHubClient`** (paginated; typed
  401/403-rate-limit/404 → `@tessera/core` errors) — **no Octokit**, so the package stays
  dependency-free (ADR-0015 precedent). **Network only when a source is explicitly configured**
  (NFR-3); tests use an in-memory **fake**, with an **env-guarded live smoke** (`TESSERA_TEST_GITHUB=1`).
- **Auto-memory extraction (FR-14):** deterministic, rule-based `MemoryExtractor`s — **ADR** →
  `decision` (from the Decision section), **merged PR** → `decision`, **closed issue** → `lesson` —
  plus **`createMemoryExtractionSink`**, a `DocumentSink` **decorator** that captures **idempotently**
  by `metadata.source` (`adr:NNNN` / `github:owner/repo#n`): supersede-on-change, skip-if-identical,
  **never duplicate**. **`teeSink`** fans out to persistence + extraction. The memory dependency is a
  **structural `MemoryCaptureService` seam** → ingestion gains **no new runtime dep and no cycle**.

**Decision (ADR-0024):** GitHub via REST `fetch` (not Octokit) + heuristic extraction via a structural
memory seam. Deferred: commit-message extraction (needs per-commit ingestion), LLM extraction, GitHub
source wiring into the Local profile (F-015), webhooks/realtime (F-021).

**Evidence/verification (all green, workspace-wide):** state (33 features, **17 effect-links**,
wip_limit 1) · typecheck (27) · lint (15) · format · **test (27 tasks; ingestion 48 = prior 25 + 23
new)** · build (15). New tests: github-client (fake-fetch pagination/headers/error-map), github
connector conformance + provenance + incremental + include-filter (fake client), adr/github extractors,
extraction-sink capture/skip/supersede + tee, and a full **fs → pipeline → memory** integration proving
the ADR yields one decision, a plain file yields none, re-scan is idempotent, and editing the ADR
supersedes the memory to v2.

**Effects:** E-009 (github connector realized under the existing Connector port) + E-010 (new memory
consumer via the structural seam) + **new E-017** (the auto-extraction seam).

**Lesson:** [[auto-extraction-structural-memory-seam]] — a cross-package "producer→consumer" step
(ingestion doc → memory capture) can stay dependency-free and acyclic by declaring a **minimal
structural interface** for the consumer instead of importing it, and by making it an **additive
`DocumentSink` decorator** (composed via `teeSink`) rather than mutating the worker. Key it on a stable
`source` id so re-ingest supersedes/skips (idempotent), never duplicating.

**Next step:** continue R1 by id — **F-018** (temporal retriever; simplest, fully offline, fits the
existing `Retriever` interface E-012), then F-019/F-020 (compiler compression/caching), **F-022**
(generated SDK, supersedes `lib/api`), **F-023** (Postgres + pgvector, the only R1 `must`). Wiring a
GitHub source into the Local profile (F-015) is a small follow-up seam when a source config lands.

---

## 2026-07-01 — Align All Route Pages with Dashboard 3 Design System
Aligned all routes and views (Search, Inspector, Graph, Memory, Settings, Sources) with the flat, borderless, matching-card-background theme.
- **Global Card Styles:** Removed default borders from the global `Card` component in `ui/card.tsx` to automatically render all cards across the application flat and borderless. Removed `border-b` horizontal dividers from card headers in `dashboard.tsx`, `inspector-view.tsx`, `search-view.tsx`, `recent-conversations.tsx`, `support-activity.tsx`, and `team-on-duty.tsx` to match efferd's flat aesthetic.
- **Unified Page Layout & Headers:** Removed duplicate H1 page headers from `search/page.tsx` and `inspector/page.tsx`, and wrapped their views in the same `max-w-4xl w-full space-y-4` layout used by the Dashboard.
- **Header Separator & Buttons UI/UX:** Replaced stretched Radix vertical separator components in `app-header.tsx` with clean CSS separators of exact `h-4 w-px` bounds. Standardized all action buttons in the header to `variant="ghost" size="icon-sm"` to remove cluttered borders.
- **Search & Inspector UI Overhaul:** Wrapped the Compile form and Search input inside their own unified `border-none bg-sidebar p-4` cards. Refined inner card lists, margins, code pre elements, and indicators to use compact typography and colors matching the homepage. Replaced Lucide icons with cohesive `IconPlaceholder` references.
- **ComingSoon & EmptyState Refinement:** Updated `EmptyState` and `ErrorState` components to be borderless, use `bg-card` (#171717), and have compact typography/padding. Refined `ComingSoon` to stretch and align itself vertically and horizontally at the exact center of the page.
- **Button Physics & Micro-Animations:** Embedded `active:translate-y-[1px]` to standard buttons to create clickable physics, and implemented tailwind color-mix variables for hover outlines.
- **Global Cursor Rules:** Configured global cursor-pointer styles on buttons and interactive roles, and cursor-not-allowed on disabled states.
- **Evidence:** Clean typecheck, production build, and all 5 E2E Playwright tests (including WCAG A/AA Axe scans) pass green.

---

## 2026-06-30 — Solidify Dashboard: Remove Fake Data, Align Exact Theme Colors & Refine Layout
Refined the dashboard implementation to remove all hardcoded mock data, align colors, customize scrollbars, and optimize layout margins/paddings.
- **Removed Fake Data & Structured Zeroth UI:** Updated all dashboard components to accept dynamic data props. Designed a flexible-height, accessible zeroth UI blueprint for Recent Compilations showing empty metadata and file paths (`0 tokens`, `0.00s compile time`) with a clear call-to-action button, satisfying WCAG AA color contrast rules.
- **Tessera Geometric Logo:** Replaced logo paths in `logo.tsx` with a highly polished mathematical, floating isometric cube made of 3 rhombuses representing mosaic pieces (tesserae) separated by precise parallel gaps.
- **Exact Color Palette Alignment:** Updated card and popover variables in `globals.css` to `#171717` (exactly matching the sidebar background color) and removed borders on all dashboard components.
- **Layout and Padding Fixes:**
  - Removed `h-full` from `SidebarInset` in `app-shell.tsx` to prevent vertical overflow clipping and show rounded corners at the bottom.
  - Flattened stats card markup to direct flex children under Card with a uniform `gap-4` spacing.
  - Reduced collapsed sidebar outer padding to `p-1` and width to `50px`, hiding the search button when collapsed so the Quick Create button centers perfectly.
- **Evidence:** Typecheck, build, and E2E Playwright tests (5/5 tests, including WCAG A/AA Axe checks) pass green.

---

## 2026-06-30 — Align Dashboard with efferd's Dashboard 3 (F-014/F-028 alignment complete)
Completed the alignment of the frontend UI/UX and design system with efferd's Dashboard 3 using the fetched registry sources.
- **Implemented Shell Components:** Created `custom-sidebar-trigger.tsx`, `latest-change.tsx`, `nav-user.tsx` (wrapped in focusable button), `app-shared.tsx` (dynamic navigation), `app-sidebar.tsx` (collapsible grouped navigation + latest change), `app-header.tsx` (trigger + breadcrumbs + theme toggle + search + user menu), and updated `app-shell.tsx`.
- **Implemented Dashboard 3 Visuals:** Created `dashboard.tsx` rendering `DashboardStats` (Tessera empty/onboarding states), `ConversationVolumeChart` (Area), `ChannelBreakdownChart` (Pie), `CsatResponsesChart` (Stacked Bar), `FirstReplyTimeChart` (Line), `TeamOnDuty` (List + Dropdown), `RecentConversations` (Table), and `SupportActivity` (operational signals).
- **a11y & TS Fixes:** Fixed `exactOptionalPropertyTypes` compatibility across components. Fixed all Playwright/Axe a11y violations: wrapped Avatar trigger in `<Button>` (`aria-allowed-attr`), added `aria-label` to latest-change close button (`button-name`), wrapped sidebar items in `<SidebarMenu>` (`listitem`), and added focus/label to Table scroll container (`scrollable-region-focusable`). Fixed Playwright E2E link strict-mode violation.
- **Evidence:** Typecheck, lint, format, unit tests (13/13 web, 27/27 total), and E2E Playwright tests (5/5 including Axe-core WCAG A/AA verification) all pass green.

---

## 2026-06-30 — Dashboard redesign: efferd Dashboard 3 as the binding design reference
Second, deeper UI overhaul after the reviewer rejected the prior look as generic. Researched the
references (efferd/coss-ui/shadcnblocks are all **shadcn blocks**; Aceternity = marketing pages;
Astryx = immature) and **viewed efferd via the Claude-in-Chrome extension** to pick a dashboard.
- **Decision (ADR-0023):** stay on shadcn/ui (ratifies ADR-0009/0021); **bind efferd Dashboard 3**
  as the concrete reference, extracted from its real registry source (`@efferd/dashboard-3` +
  `@efferd/app-shell-3`). Locked in [`DESIGN-SYSTEM.md` §0](../../docs/design/DESIGN-SYSTEM.md).
- **Implemented (3 commits):** (1) added the shadcn primitives via the official CLI — Sidebar,
  Chart (Recharts), Table, Select, Avatar, Breadcrumb, Collapsible, Kbd (import + fine-tune, as
  the lead wanted); (2) **dark-first design system** (near-black, flat `shadow-none` cards,
  monochrome `--chart-*` ramp, emerald-up/red-down `Delta` as the only accent) + **shell rebuilt
  on the shadcn Sidebar** (inset, grouped nav with section labels, **mosaic logo**, breadcrumb
  header) + signature components (`Delta`/`Logo`/`StatusIndicator`/formatters); (3) **Overview**
  rebuilt to efferd's stat-card grid with honest empty/onboarding states (no fabricated data).
- **Also fixed earlier:** eslint `tsconfigRootDir` (typescript-eslint#10841), `@tessera/server`
  `dev`/`dev:mcp` scripts (tsx), `apps/web/.env.example`.

**Evidence (all green, every commit):** typecheck (27) · lint (15) · format · test (web 13;
workspace 27) · build · **e2e (5 incl. axe WCAG A/AA on home/search/inspector)**. Verified
**visually in dark + light** by screenshot each step (no washout). Commits 8999db9, dfa077d,
2a81f0b.

**Lesson:** [[frontend-quality-bar]] — follow a concrete, proven reference (a real shadcn block
like efferd) rather than inventing taste; pull its actual registry source for fidelity; the
component library was never the problem (we were already on shadcn — efferd IS shadcn).

**Next:** data-rich chart cards (activity area / breakdown donut / recent table) as real metrics
endpoints land; pull efferd Pro blocks (7/8/9) if desired. (Refinement of F-014/F-028 — no
feature-status change.)

---

## 2026-06-30 — Fixes + UI design overhaul (apps/web) — enterprise-grade pass
Refinement of the R0 UI (no feature-status change) addressing reviewer feedback + DX gaps.
- **Lint:** set `tsconfigRootDir: import.meta.dirname` in the web + root flat ESLint configs —
  fixes the IDE "multiple candidate TSConfigRootDirs" parser error (typescript-eslint#10841).
- **DX:** added `@tessera/server` `dev`/`dev:mcp` scripts (`tsx watch src/bin/*`) so
  `pnpm --filter @tessera/server dev` works (first run downloads the embedding model — local-first;
  same as `start`). Added [`apps/web/.env.example`](../../apps/web/.env.example)
  (`NEXT_PUBLIC_API_BASE_URL`) + gitignored local env files.
- **UI overhaul** (the dashboard looked generic/"washed-out"): refined the token palette (cool
  neutrals + a restrained violet accent, off-white canvas, white cards, deeper cool-slate dark),
  adopted the **Geist** typeface (bundled — offline-safe), polished the sidebar (gradient brand
  mark, "Platform" section, profile footer), refined the topbar, and gave KPI cards icon chips +
  stronger hierarchy. **Removed the content fade-in** — it flashed washed-out on first paint and
  was the root cause of the "worst UI" report (and of axe contrast failures: axe saw the
  mid-animation blended color).
- **a11y:** fixed two axe contrast violations the new palette/fade exposed — the sidebar section
  label (dropped the `/70` opacity) and the primary button (deepened the violet so white text
  clears 4.5:1).

**Evidence (all green, workspace-wide):** typecheck (27) · lint (15) · format · test (27) · build
(15) · **e2e (15) incl. axe WCAG A/AA = 0 violations on home/search/inspector (light + dark)**.
**Verified visually** by screenshotting the running prod build in light + dark.

**Lesson:** [[frontend-quality-bar]] — gates green ≠ good UI; render + screenshot before declaring
UI done. [[e2e-against-prod-build]] — and avoid decorative opacity page-fades (FOUC + a11y flake).

---

## 2026-06-30 — F-014 DONE: Dashboard — global search + Context Package inspector (R0 UI arc complete)
**What changed** (the dashboard now drives the real engine — FR-41/FR-44/FR-49, NFR-9; ADR-0022)
- **Data layer (ADR-0022 — production-real, no mock data in the app):** `apps/web/lib/api` —
  `apiFetch` (base URL via `NEXT_PUBLIC_API_BASE_URL`, default `http://localhost:3000/v1`; parses
  the `{ error: { code, message } }` envelope → `TesseraApiError`) + typed methods mirroring the
  `/v1` Zod schemas + **TanStack Query** hooks (`useSearch`/`useCompile`); `QueryClientProvider`
  wired in `app/providers.tsx`. It is a **drop-in seam** the F-022 `@tessera/sdk` replaces.
- **Search (FR-41):** debounced query → `POST /v1/search`; ranked results, each showing
  **provenance** — the contributing signals (semantic/keyword/graph/symbolic) with per-signal
  rank/score/weight on hover. Loading/empty/error states.
- **Context Package Inspector (FR-44, flagship):** task+budget form → `POST /v1/compile` →
  renders the `ContextPackage`: package **scores** (budget adherence / provenance coverage /
  redundancy as accessible progress bars), **sections → fragments** (kind, tokens, score,
  per-fragment **"why included"**, provenance signals + `expandedFrom`), and the full
  **CompilationTrace** (per-stage input→output + drops with reasons). Provenance-first throughout.
- Added the **Inspector** nav item; replaced the `/search` stub.

**Decision (recorded ADR-0022):** the lead required a production system with **no dummy data**.
ADR-0009 mandates data via the generated SDK, but `@tessera/sdk` is F-022 (R1). Rather than
reorder the roadmap or ship fixtures, F-014 uses a **real, typed, centralized `/v1` client**
(`lib/api`) behind TanStack Query — production-real, "no scattered fetch", and a localized swap
for the SDK at F-022. Tests stub at the network/client boundary (test infra, not app data).

**Evidence/verification (all green, workspace-wide):** state (33 features, 16 effect-links) ·
typecheck (27) · lint (15) · format · test (web **13** — `lib/api` envelope parsing + search +
inspector via Vitest/RTL; workspace 27) · build (`next build`, **9 routes** incl. `/inspector`;
workspace 15) · **e2e (web 5 Playwright incl. `@axe-core` WCAG A/AA on home/search/inspector = 0
violations; workspace 15)**. e2e now serves the **production build** (`next build && next start`)
instead of the dev server — removes Turbopack cold-compile flakiness on this slow filesystem.

**Lesson:** [[e2e-against-prod-build]] — drive UI e2e against `next start` (prebuilt static pages),
not `next dev`; the dev compiler's mid-test cold-compile is the flake source under parallel load.
Centralize the data path behind one typed client + React Query so swapping the hand-client for the
generated SDK (F-022) is a localized change.

**Milestone:** the **R0 UI arc is complete** (F-033 harness → F-028 foundation → F-014 dashboard).
With the full R0 backend already done, **all of R0 is now done** except F-022's SDK swap is an R1
follow-up that supersedes `lib/api`.

**Next step:** R1 — e.g. **F-022** (generated SDK, supersedes `lib/api`), **F-017/F-018/F-019/
F-020** (GitHub connector + auto-memory, temporal retriever, compiler compression/caching),
**F-023** (Postgres + pgvector). Pick per release order.

---

## 2026-06-30 — F-028 DONE: UI foundation (Next.js dashboard shell, tokens/theming, shadcn, ⌘K)
**What changed** (the dashboard foundation — FR-49, NFR-9; ADR-0009; built on the F-033 harness)
- **`apps/web` (`@tessera/web`) stood up**: Next.js 16 (App Router, React Server Components) +
  React 19 + TypeScript strict + Tailwind v4 + shadcn/ui, wired into the workspace toolchain
  (turbo typecheck/lint/test/build/e2e). Built with the [`build-ui`](../skills/build-ui/SKILL.md)
  skill against [`DESIGN-SYSTEM.md`](../../docs/design/DESIGN-SYSTEM.md) + its manifest.
- **Design tokens + theming**: semantic CSS variables (OKLCH) in `app/globals.css`
  (`:root` + `.dark`) mapped via Tailwind v4 `@theme`; **light/dark/system** via `next-themes`
  (system default). Components reference tokens only — never hardcode (E-004).
- **Base shadcn primitives** (owned in-repo, `components/ui/*`): button, card, input, badge,
  separator, skeleton, tooltip, dialog, dropdown-menu, sheet, command, sonner.
- **App shell**: collapsible sidebar (`--sidebar-*`) + sticky topbar (command-palette search,
  theme toggle, **user/org placeholder — auth is R2/F-025**), responsive mobile drawer (Sheet),
  skip-link + landmarks. **⌘K command palette** (cmdk) with nav + theme actions, a Zustand store,
  and a global Ctrl/⌘-K listener.
- **UX-baseline primitives** (FR-49): `EmptyState`/`ErrorState`, `Skeleton`, sonner toasts;
  **functional motion** (`lib/motion` + Framer `MotionConfig reducedMotion="user"` + a CSS
  reduced-motion fallback). Navigable stub pages for the remaining nav routes.

**Scope honesty:** foundation only — **no data layer** (the generated `@tessera/sdk` is F-022/R1;
F-014 wires real data + the Context Package inspector). Next 16/Tailwind v4 are latest-stable
within the locked stack (no new stack ADR). `next-env.d.ts` is Next-generated (gitignored); the
web `typecheck` runs `next typegen` first so the gate is self-sufficient before the build gate.

**Evidence/verification (all green, workspace-wide):** state (33 features, 16 effect-links) ·
typecheck (27 tasks; web = `next typegen` + `tsc`) · lint (15) · format · test (web **7**
component tests — Vitest+RTL+jsdom: cn, EmptyState, ThemeToggle, CommandPalette; workspace 27) ·
build (`next build`, 8 routes prerendered; workspace 15) · **e2e (web 3 Playwright incl.
`@axe-core` WCAG A/AA = 0 violations; workspace 15)**. The **`a11y` gate is now active**
(ADR-0021); CI installs the Playwright browser before gate 6 (E-005 lockstep).

**Decisions (delegated to Claude, under ADR-0009/0021):** Next 16 + Tailwind v4 (latest stable);
shadcn owned-in-repo; Zustand for the ⌘K open-state; axe-in-Playwright as the a11y gate;
`next typegen` to make web typecheck order-independent.

**Lesson:** [[next-typegen-before-tsc]] — for a Next app under a typecheck-before-build gate
order, run `next typegen` inside the typecheck script and gitignore `next-env.d.ts`, so the gate
is self-sufficient on a clean tree. Adding a browser-based e2e means CI must `playwright install`
before the e2e gate (keep gates.json ↔ ci.yml in lockstep, E-005).

**Next step:** **F-014** (dashboard: global search + **Context Package inspector** + UX baseline)
— now unblocked (F-028 + F-011 done). It adds the data layer (interim typed client until the
F-022 SDK) and the provenance-first inspector.

---

## 2026-06-30 — F-033 DONE: Frontend execution harness (UI skills + web gates + design manifest)
**What changed** (the frontend harness, built BEFORE the UI arc so it is actually used — ADR-0021)
- **Decision — keep shadcn/ui; defer Astryx.** Evaluated **Meta Astryx** (open-sourced
  2026-06-27, MIT; React on **StyleX**; CLI + **MCP server + JSON manifest** "agent-ready"; 150+
  components; coexists with Tailwind via precompiled CSS + cascade layers). **Deferred to an R1
  watch-item** and **ratified [ADR-0009](../../docs/adr/0009-frontend-stack-and-design-system.md)**:
  a 3-day-old public dep fails the production-grade bar, would replace shadcn and orphan the
  tweakcn token workflow + the curated reference set, and trades owned-in-repo control for an
  external dependency.
- **Stole Astryx's best idea** — a **machine-readable design manifest**:
  [`docs/design/design-system.manifest.json`](../../docs/design/design-system.manifest.json)
  projects `DESIGN-SYSTEM.md` (token roles, themes, component inventory, motion params, UX
  baseline, a11y + perf budgets) for the harness. DESIGN-SYSTEM.md stays the source of truth;
  token *values* land at F-028 (tweakcn export).
- **Four frontend skills** in `.harness/skills/` (+ `.claude/` shims), **subordinate to
  DESIGN-SYSTEM.md**, attributed in [`NOTICE.md`](../../NOTICE.md) (ECC pattern):
  **`build-ui`** (UI orchestrator: server-first, tokens, compose, UX baseline, provenance, a11y),
  **`shadcn`** (from the official shadcn skill, MIT), **`frontend-craft`** (from Anthropic
  `frontend-design` Apache-2.0 + Leonxlnx `taste-skill` MIT — explicitly capped by "restraint over
  richness"), **`motion`** (from Emil Kowalski's skill, MIT).
- **Web verification gates** registered in
  [`gates.json`](../../.harness/verification/gates.json): **`a11y`** (axe / WCAG 2.1 AA) and
  **`web-perf`** (bundle/perf budget), **status `planned`** — activate with F-028 (mirroring how
  `e2e` activated with F-011). Refreshed [`apps/web/AGENTS.md`](../../apps/web/AGENTS.md).

**Auth — confirmed out of scope for R0.** R0 local mode is **auth: none/local** (PRD deployment
matrix). OIDC + org RBAC + scoped tokens is the hosted direction (NFR-2; `AuthProvider` port in
ARCHITECTURE), built in **F-025/F-026 @ R2**; the specific library (Better Auth/Auth.js vs
Keycloak) is an **open ADR @ R2**. F-028/F-014 need **no login** — only a placeholder user/org
slot in the topbar.

**Evidence/verification:** `node scripts/verify-state.mjs` green (33 features, 16 effect-links,
wip_limit 1). Docs/harness-only change (no code) — code gates unaffected; format:check excludes
docs/harness. ADR-0021 added to the index.

**Decisions (delegated to Claude, recorded ADR-0021):** keep shadcn (defer Astryx to R1); adapt
skills into the harness rather than `npx skills add` (harness stays canonical); add an
agent-readable manifest; web gates planned until F-028.

**Lesson:** [[frontend-harness-before-ui]] — build the design harness (skills + machine-readable
manifest + gates) before the first UI feature so the design system is *executable* for agents,
not just prose; resist swapping a locked, sound foundation for a brand-new framework (production
bar) but steal its best idea.

**Next step:** **F-028** (UI foundation: Next.js app, tokens/theming, base shadcn, app shell,
⌘K) — built with [`build-ui`](../../.harness/skills/build-ui/SKILL.md). Then **F-014** (dashboard:
global search + Context Package inspector).

---

## 2026-06-29 — F-013 DONE: Plugin SDK + plugin-host (@tessera/plugin-host)
**What changed** (the extensibility layer — ARCHITECTURE §12; FR-40/58)
- New **`@tessera/plugin-host`**: a **uniform envelope** over Tessera's existing extension-point ports
  (it does NOT re-define them) + a host with discovery / config validation / lifecycle / failure
  isolation.
- **SDK** (`domain.ts`): `PluginKind` (connector/processor/ai-provider/storage-backend/
  retrieval-strategy); `Plugin<TConfig, TCapability>` = `manifest` (id/kind/name/version + **Zod
  `configSchema`**) + `setup(config, ctx) → PluginInstance` whose **`capability` is the existing port**
  (Connector, Embeddings, Retriever, …); `PluginInstance` (capability + optional start/stop/dispose);
  `PluginContext` (optional structural logger); `PluginInfo`/`PluginStatus`.
- **Host** (`createPluginHost`): `register` (unique ids) · `load` (validate config → `setup`) ·
  `start`/`startAll`/`stop`/`stopAll`/`dispose` · `capability<T>` · `list({kind})`. **Failure
  isolation (FR-58):** invalid config + setup/lifecycle errors → `failed` (with message), **never
  throws out of the host** or stops other plugins; only an *unknown id* throws. Heterogeneous plugins
  stored type-erased behind one localized cast (no `any`).
- **First-party plugins (dogfooding):** `filesystemConnectorPlugin` (wraps the ingestion filesystem
  connector) + `fakeEmbeddingsPlugin`/`transformersEmbeddingsPlugin` (wrap the AI embeddings) — same
  contract a third party uses. They live in plugin-host so it depends on ingestion/ai **one-way**
  (no cycle; domain packages untouched).

**Scope honesty:** error isolation, **not** process/sandbox isolation (R0). A split `plugin-sdk`/
`plugin-host` (so domain packages export their own plugins) + wiring F-015 via the host are follow-ups.
New effect **E-016**; the PluginKinds stay aligned with the underlying ports (E-007/8/9/12). ADR-0020.

**Evidence/verification (fresh, all green):** state (32 features, **16 effect-links**) · typecheck
(26/26) · lint (14/14) · format:check (all matched) · **test = prior 190 + plugin-host 10** = **200
passing** (host: config validation, duplicate/unknown id, setup + start failure isolation,
load→start→stop→dispose lifecycle, `startAll` isolation, list filter; integration: first-party
filesystem connector + fake embeddings load through the host and their capabilities work) ·
test:e2e = api 14 + mcp 7 = 21 · build (14/14).

**Decisions (delegated to Claude, recorded ADR-0020):** wrap existing ports (don't re-define);
first-party wrappers in the host (no cycle); failure isolation over throwing.

**Lesson:** [[plugin-sdk-envelope-over-ports]] — a plugin SDK over code that already has ports is a
uniform envelope (capability = the existing port); dogfood first-party wrappers in the host to avoid
cycles; isolate failures so a bad plugin can't crash startup.

**Next step:** R0 remaining is the **UI arc** — **F-028** (UI foundation: Next.js, design tokens,
shadcn, app shell, command palette) → **F-014** (dashboard: global search + Package Inspector). The
entire R0 **backend** (engine + surfaces + config + observability + plugins + CI) is now complete.

---

## 2026-06-29 — F-029 DONE: CI/CD pipeline running the verification gates (.github/workflows)
**What changed** (verification at scale — ADR-0010; NFR-15)
- The `verify` job already mirrored all **seven gates** (state → typecheck → lint → format → test →
  build → e2e) on **Node 22.16.0 + pnpm 9** (F-001 + F-011). F-029 completes the plan ADR-0010 set:
- **Secret scanning** — new **`secret-scan`** job running **`gitleaks/gitleaks-action@v2`** over full
  history (`fetch-depth: 0`), with a scoped **`.gitleaks.toml`** (default rules + allowlist). The
  allowlist excludes secret-SHAPED placeholders in **tests / examples / docs+plans / the ingestion
  redaction detectors** — while still scanning **production source** (where a real leaked key matters).
  Verified the only secret-format strings in the repo live in allowlisted tests/plans, so the scan
  passes on first run.
- **Dependency audit** — the existing `security` job (`pnpm audit --audit-level=high`).
- **Activation + branch protection** — documented in the workflow header: activates on a GitHub remote
  (none today); branch protection on `main` should require `verify` + `security` + `secret-scan`.

**Scope note:** E-005 (gates.json ⇄ ci.yml ⇄ verification.md) preserved — the seven **gate steps**
still mirror `gates.json`; `security` + `secret-scan` are *additional* checks (ADR-0010), not gates.
No new ADR (ADR-0010 already specified gates + dependency audit + secret scanning + branch protection).
CD (build/publish/deploy) stays out of scope (R1 image / R2 cloud).

**Evidence/verification:** `state` valid (32 features, 15 effect-links) — F-029's gate; `format:check`
green (prettier governs `ci.yml`; YAML parses). The workflow's live run is on GitHub once a remote
exists — that is its activation (ADR-0010). No code changed, so the code gates are unaffected.

**Next step:** R0 remaining — **F-013** (Plugin SDK + plugin-host), then the R0 UI arc (**F-028**
foundation → **F-014** dashboard). The backend R0 (engine + surfaces + config + observability + CI)
is complete.

---

## 2026-06-29 — F-016 DONE: Observability baseline (@tessera/observability)
**What changed** (cross-cutting traces + logs + metrics, kept additive; ARCHITECTURE §obs; NFR-7)
- New **`@tessera/observability`**: a toolkit where **libraries use the OTel API only** and the SDK is
  wired at the process (`startTelemetry`, no-op until then).
  - **`createLogger`** — Pino + **redaction** of secret keys *and* raw content (never logged, NFR-7);
    `silentLogger`; `stderr` mode for MCP (stdout is the protocol).
  - **`withSpan`/`currentTraceId`** — active-context spans (children nest); correlation id.
  - **`createInstruments`/`recordCompileStageDurations`/`registerQueueDepthGauge`** — http / service /
    **compile-stage** latency histograms (+ queue-depth gauge).
  - **`startTelemetry`** — NodeSDK (providers + async context manager + **HTTP auto-instrumentation** so
    requests get server spans that service spans nest under); console exporters (OTLP = follow-up).
  - **`instrumentServices(services, obs)`** — **additive** ApiServices wrapper: every call → child span +
    latency; compiler records per-stage metrics. **Domain packages untouched.**
- **Additive enhancements to verified features (no breakage):** compiler (F-010) times each stage into
  the trace (`TraceStage.durationMs?`); `buildServer` (F-011) gains an optional **`loggerInstance`** so
  the redacting Pino logger backs per-request logging + correlation (Fastify v5 wants `loggerInstance`,
  not `logger`). The REST/MCP response schemas simply strip the new optional trace field.
- **Wired into `apps/server` (F-032):** `startApiServer`/`startMcpServer` take `observability` →
  instrument services, use the logger, REST records HTTP latency in an `onResponse` hook. Bins build
  observability from `config.logLevel`; telemetry starts only when **`TESSERA_TELEMETRY=1`** (off by
  default → no console spam; logging always on). MCP logs to **stderr**.

**Scope honesty:** **seams** (instrument provided, data wired later) — per-adapter spans, a fed
queue-depth gauge (the Queue port exposes no depth), OTLP exporters via config. New effect **E-015**;
additive ripples on **E-013** (compiler trace) + **E-003** (buildServer option). ADR-0019.

**Evidence/verification (fresh, all green):** state (32 features, **15 effect-links**) · typecheck
(24/24) · lint (13/13) · format:check (all matched) · **test = prior 179 + observability 10 + server 1**
= **190 passing** (logger redaction incl. nested; withSpan create/nest/error/currentTraceId; compile-stage
histogram; instrumentServices passthrough + spans; startTelemetry start/shutdown; compiler durationMs;
plus a server test booting the instrumented REST path) · test:e2e = api 14 + mcp 7 = 21 · build (13/13).

**Decisions (delegated to Claude, recorded ADR-0019):** OTel API in libs / SDK at the process; wrap
(`instrumentServices`) rather than retrofit; additive-only changes to F-010/F-011; telemetry off by
default (`TESSERA_TELEMETRY=1`).

**Lesson:** [[observability-additive-otel-api-in-libs]] — add a cross-cutting concern over verified
code via a composition-layer wrapper + optional hooks (API-only libs, SDK at the process), never by
threading params through every layer.

**Next step:** R0 remaining — **F-029** (CI/CD running the gates + audit/secret scanning), **F-013**
(Plugin SDK + plugin-host), or the R0 UI (**F-028** → **F-014**). Engine is bootable + observable.

---

## 2026-06-29 — F-032 DONE: Runnable server entrypoints (@tessera/server)
**What changed** (the payoff — the engine is now bootable end-to-end; ADR-0018 deferred this thin bin)
- New **`apps/server`** (`@tessera/server`): boots the Local profile and serves both surfaces.
  Depends on `config` + `api` + `mcp`; **nothing depends on it** → the `api↔config` cycle (avoided by
  the type-only `ApiServices` import) is never reintroduced.
- `createServerRuntime` = `loadConfig`(env + overrides) → `createLocalRuntime` (shared by both bins).
- **`startApiServer`** builds the F-011 server over `runtime.services`, `listen`s (`HOST`/`PORT`,
  default `127.0.0.1:3000`), returns a handle whose `close()` stops the server then the runtime.
- **`startMcpServer`** = `startMcpStdio(runtime.services)`; the connected-server type is derived via
  `Awaited<ReturnType<typeof startMcpStdio>>` so there's **no direct MCP-SDK dependency**.
- Executable bins `src/bin/{api,mcp}.ts` (`#!/usr/bin/env node`; `package.json#bin` = `tessera-api` /
  `tessera-mcp`) with `SIGINT`/`SIGTERM` graceful shutdown. The MCP bin logs to **stderr only**
  (stdout is the protocol). Shebang preserved through the tsc build.

**Scope note:** added as a tracked R0 feature (F-032) — the runnable bin explicitly deferred from
F-011/F-015. Realizes the "runnable REST/MCP process bins" consumer already recorded on effect E-014
(no effects change). No new ADR (covered by ADR-0018).

**Evidence/verification (fresh, all green):** state (**32 features**, 14 effect-links) · typecheck
(22/22) · lint (12/12) · format:check (all matched) · **test = prior 177 + server 2** = **179
passing** — the REST test **boots the real Local profile on an ephemeral port and answers
`/health`,`/ready`,`/v1/openapi.json` over actual HTTP** (offline, fake embeddings); the MCP test
covers the runtime→server composition · test:e2e = api 14 + mcp 7 = 21 · build (12/12). Bin shebang
verified in `dist/bin/api.js`.

**Decisions (delegated to Claude):** track the deferred bin as F-032; keep it in a separate app to
stay acyclic; derive the connected-server type through `@tessera/mcp` (no phantom SDK dep); smoke-test
the REST bin with a real socket on port 0.

**Next step:** R0 hardening — **F-016** (observability: OTel + Pino + metrics), **F-029** (CI/CD
running the gates), or the R0 UI (**F-028** foundation → **F-014** dashboard). The R0 engine is
bootable over REST + MCP from a config-driven Local profile.

---

## 2026-06-29 — F-015 DONE: Deployment profile & config loader (@tessera/config)
**What changed** (the composition root — makes the engine bootable; ARCHITECTURE §16/§132; FR-50/53)
- New **`@tessera/config`**: a validated config + the **Local** profile that wires the real local
  stack into the `ApiServices` the REST (F-011) and MCP (F-012) surfaces consume.
- **Config schema + loader** (`schema.ts`/`load.ts`, classic Zod 3): `TesseraConfig` (profile, env,
  logLevel, storage paths, embeddings{provider/model/dimension/ollamaUrl}, budgets, secrets) with
  defaults; `loadConfig(env, overrides)` applies **`TESSERA_*`** env overrides (merged per section,
  explicit overrides win) and validates — throws a typed `ValidationError` at startup (fail fast).
- **SecretsProvider port** (`secrets/`): `{ get, require }` with **env** (prefixed `process.env`) and
  **file** (JSON map) adapters; `require` fails fast without echoing the value. KMS/vault = cloud.
- **`createLocalRuntime(config)`** wires SQLite + sqlite-vec + filesystem + in-process queue +
  Transformers.js (zero external deps), composes memory/graph/hybrid-search/compiler → `ApiServices`,
  and returns a `Runtime` (stores, embeddings, keyword retriever for indexing, readiness probe,
  `close()`). The **embedding dimension flows from the provider into the vector store** (ADR-0006).
  Non-`local` profiles throw until F-023.
- **Compiler corpus seam** = a **blob-backed `FragmentSource`** (`createBlobFragmentSource`/
  `putFragment`): a `ref` → a blob holding JSON `{kind,text,metadata?}`. Ingestion's persistent
  DocumentSink writes these (downstream).
- **No `api↔config` cycle:** `ApiServices` is imported **type-only** (api never imports config; the
  runnable process bin that wires `config → startServer`/`startMcpStdio` lives outside both — a
  thin follow-up). New effect **E-014**. ADR-0018.

**Scope honesty:** the runnable REST/MCP process bin = small follow-up (kept out to stay acyclic);
Postgres+pgvector `self-hosted`/`cloud` profile = F-023; budgets are validated/exposed but applied
at the request layer; the blob FragmentSource convention is provisional until ingestion persistence.

**Evidence/verification (fresh, all green):** state (31 features, **14 effect-links**) · typecheck
(19/19) · lint (11/11) · format:check (all matched) · **test = prior 164 + config 13** = **177
passing** (schema defaults/overrides/validation, env+file secrets, and an **integration test that
boots the real Local profile** over `:memory:` SQLite+sqlite-vec + a temp blob dir with the **fake**
provider and exercises memory/graph/search/compile + readiness) · test:e2e = api 14 + mcp 7 = 21 ·
build (11/11). Real Transformers.js wiring covered by an env-guarded test (`TESSERA_TEST_TRANSFORMERS=1`).

**Decisions (delegated to Claude, recorded ADR-0018):** config is the composition root (type-only
ApiServices → no cycle); embedding dimension drives the vector store; FragmentSource over the blob
store; prove real wiring offline with the fake provider.

**Lesson:** [[composition-root-type-only-and-fake-provider]] — a composition root references the
surface contract **type-only** (no cycle) and proves real wiring by swapping only the slow/external
leaf (embeddings → fake, stores → in-memory/temp).

**Next step:** the **runnable process bin** (a tiny entry: `createLocalRuntime(loadConfig())` →
`startServer`/`startMcpStdio`), or **F-013** (Plugin SDK + plugin-host), **F-016** (observability),
or **F-028/F-029** (UI foundation / CI). R0 engine is now bootable over REST + MCP.

---

## 2026-06-29 — F-012 DONE: MCP server (@tessera/mcp)
**What changed** (the second surface — "one engine, two surfaces"; FR-35)
- New **`apps/mcp`** (`@tessera/mcp`): `@modelcontextprotocol/sdk@1.29` `McpServer`.
  **`buildMcpServer(services)`** registers five tools — **`search`, `compile_context`, `get_effects`,
  `capture_memory`, `explain`** — whose thin handlers wrap the **same** F-007…F-010 services the REST
  API wraps. The shared contract is expressed by a **type-only** `ApiServices` import from
  `@tessera/api` (zero runtime coupling — **no Fastify in the MCP runtime**; verified the dist has no
  value import of `@tessera/api`).
- **Inputs validated** by the SDK against **classic Zod 3** raw shapes (the SDK's API; consistent with
  the domain packages — only `@tessera/api` uses `zod/v4`). **Results** carry text JSON + typed
  `structuredContent`; **no `outputSchema`** (avoids output re-validation; services are the truth).
  **Errors surfaced cleanly** via a local masked envelope (`{error:{code,message,details?}}`, INTERNAL
  masked) matching REST's policy.
- **`explain`** = compile then project to per-fragment `whyIncluded` + provenance + the stage trace
  (FR-32/44), without fragment bodies. Pure `buildExplanation` (unit-tested).
- **Transport:** `startMcpStdio(services)` (stdio — what agent clients launch). Real adapter wiring +
  the launchable process are **F-015**; `buildMcpServer` is a pure factory.

**Scope honesty:** multi-client auth + quotas (MCP **gateway**) = F-026 (R2); the bootable stdio
process + config-driven adapters = F-015. Effect **E-003** *realized* (MCP half) — both surfaces now
wrap the same services; the error-envelope shape is shared policy.

**Evidence/verification (fresh, all green):** state (31 features, 13 effect-links) · typecheck (18/18)
· lint (10/10) · format:check (all matched) · **test = prior 162 + mcp 2** (`buildExplanation`
projection) = **164 passing** · **test:e2e = api 14 + mcp 7 = 21** (mcp: a real SDK `Client` over a
linked `InMemoryTransport` — `tools/list` lists the five; search/compile/effects/capture/explain happy
paths; `get_effects` unknown → clean `NOT_FOUND` isError; invalid input rejected) · build (10/10).

**Decisions (delegated to Claude, recorded ADR-0017):** type-only `ApiServices` import (twin surface
without runtime coupling); classic Zod 3 tool schemas; no `outputSchema`; stdio transport; prove with
an in-memory real-client e2e.

**Lesson:** [[mcp-twin-surface-type-only-and-inmemory-e2e]] — a second surface over shared services
should import the services contract **type-only** (compile-time guarantee, zero runtime cost) and be
proven with the SDK's own `Client` over `InMemoryTransport`.

**Next step:** **F-013** — Plugin SDK + plugin-host (discovery, config schema, lifecycle, isolation;
unblocked by F-006), or **F-015** (deployment profile/config loader) which makes both surfaces
bootable. R0 surfaces done; engine now reachable over REST + MCP.

---

## 2026-06-29 — F-011 DONE: REST API /v1 (@tessera/api)
**What changed** (the engine gets its first interface — ARCHITECTURE §11; FR-37, NFR-1/6/11)
- New **`apps/api`** (`@tessera/api`): **Fastify v5** with the **plugin + encapsulation** model.
  Routes are **thin** (validate → call a domain service → map result); they wrap the F-007…F-010
  services (memory, knowledge-graph, hybrid retrieval, context compiler). MCP (F-012) will wrap the
  **same** services — one engine, two surfaces.
- **Schema-first bridge (ADR-0016):** **`fastify-type-provider-zod@5.1`** + **`@fastify/swagger@9`** —
  **one Zod schema per route drives validation + serialization + OpenAPI** (served at
  **`GET /v1/openapi.json`**). The lib resolves schemas via Zod's **v4 core**, so the api package's
  boundary schemas use **`zod/v4`** (same physical `zod@3.25.x`; v4 subpath). Domain packages keep
  classic Zod-3 — only plain validated JSON crosses the boundary.
- **Routes:** `POST /v1/search`, `POST /v1/compile`, `GET /v1/effects?kind&key&maxDepth`, and
  `POST`/`GET` `/v1/memory`, `GET`/`PATCH` `/v1/memory/:lineageId`, `GET /v1/memory/:lineageId/history`.
  Operational (unversioned): `GET /health` + `GET /ready` (injected readiness probe → **503** until ready).
- **Consistent error envelope** (NFR-6): `{ error: { code, message, details? } }` via one
  `setErrorHandler` (`TesseraError.code → HTTP status`; **5xx masked**, no leak; Zod request failures
  → 400) + `setNotFoundHandler`. `mapError` is pure + unit-tested.
- **DI seam:** `buildServer(services)` takes injected `ApiServices` (+ optional `readiness()`). Real
  adapter wiring from a deployment profile (SQLite+sqlite-vec+filesystem+Transformers.js) and the
  bootable process are **F-015** — intentionally not here (no shipped toy composition).
- **e2e gate ACTIVATED (gate 6):** root `test:e2e` → `turbo run test:e2e`; turbo task added; **CI
  workflow runs it** (effect **E-005** honored — gates.json ⇄ ci.yml in lockstep). E2E uses
  `app.inject()` over an in-memory composition (test support).

**Scope honesty:** auth/CORS/helmet/rate-limit (per profile) = F-025 / observability F-016; realtime
SSE = F-021; generated SDK = F-022; the bootable local server + config loader = F-015. Effect
**E-003** *realized* (the REST half): the route schemas are the OpenAPI source for SDK + web + MCP.

**Evidence/verification (fresh, all green):** state (31 features, 13 effect-links) · typecheck
(16/16) · lint (9/9) · format:check (all matched) · **test (16 pkg tasks)** = prior 151 + **api 11**
(error-map + boundary-schema) = **162 passing** · **test:e2e = api 14** (`app.inject`: health/ready/503,
openapi doc lists routes, search ranked, compile budget-bounded+provenance+trace, effects ranked +
404, memory capture→read→edit(v2)→history→list + 404 + 400, not-found envelope) · build (9/9).

**Decisions (delegated to Claude, recorded ADR-0016):** Zod⇄Fastify bridge = fastify-type-provider-zod
(fulfils ADR-0002's bridge follow-up); inject services (don't wire adapters here); activate e2e now.

**Lesson:** [[fastify-type-provider-zod-v4-bridge]] — ftpz@5 needs `zod/v4` schemas even on a Zod-3
install (every route 500'd until switched); plus never `await app.register` (boots `ready()` early),
and register swagger before routes.

**Next step:** **F-012** — MCP server (search / compile_context / get_effects / capture_memory /
explain) wrapping the same domain services (unblocked by F-011). R0 engine → second surface.

---

## 2026-06-29 — F-010 DONE: Context Compiler (@tessera/context-compiler)
**What changed** (the centerpiece, G1 "compile, don't dump"; ARCHITECTURE §9; FR-27/28/29/30/32)
- New `@tessera/context-compiler` (deps: core, retrieval, knowledge-graph, storage, ai, zod).
- **`compile(task, budget, filters)`** runs **plan → retrieve → expand → rank → resolve → dedup →
  compress → assemble**: retrieve via the F-009 hybrid retriever; **expand** via `get_effects`
  (effect-dependents, `expandedFrom`); **dedup** near-duplicates by word-shingle Jaccard (no
  embeddings); **compress** = budget-fit selection that **never exceeds** the token budget (graceful
  degradation; LLM summarization is FR-31/R1); **assemble** = kind-grouped sections, per-fragment
  **provenance + whyIncluded** (FR-28/32).
- **CompilationTrace** records every stage's inputs/outputs/drops for the Package Inspector (FR-44).
- **FragmentSource** port = the corpus seam (ingestion fills it; tests use in-memory).
- **Context Quality Score** (`quality.ts`, PRD §9) + a **naive top-k** baseline; the **beats-naive**
  integration test passes — the compiler wins on relevance (expand reaches a doc keyword misses),
  redundancy (dedup), and provenance. Effects **E-003** (advances it) + **E-013**.

**Eval design note:** to make "beats naive" fair + deterministic, the labeled corpus puts the
near-duplicate among *irrelevant* docs (so dedup never drops a relevant one) and makes one relevant
doc reachable only via effect-link expansion (keyword misses it). Keyword (FTS) is the shared
baseline retriever (deterministic; fake embeddings would be random).

**Evidence/verification (fresh):** build · typecheck · lint · format green; test = core 15 +
ai 4 (+8 skipped) + storage 19 + ingestion 25 + memory 25 + knowledge-graph 23 + retrieval 23 +
**context-compiler 17** = **151 passing**. verify-state valid.

**Lesson:** [[fair-deterministic-eval-design]] — construct labeled eval suites so the system-under-
test wins for the *right* reasons, with deterministic backends (not random fake embeddings).

**Next step:** **F-011** — REST API /v1 (Fastify) wrapping these domain services
(search/compile/effects/memory), then **F-012** MCP server. R0 engine → interfaces.

---

## 2026-06-29 — F-009 DONE: Hybrid retrieval + fusion ranker (@tessera/retrieval)
**What changed** (ARCHITECTURE §8; FR-21/22/23/25/26)
- New `@tessera/retrieval` (deps: core, storage, ai, knowledge-graph, drizzle-orm, zod).
- **Common `Retriever` interface** + four retrievers: **semantic** (Embeddings → VectorStore),
  **keyword** (SQLite **FTS5**, owns the index; `index(ref,content)`), **graph** (KG lexical seed →
  expand via `get_effects`), **symbolic** (exact/prefix `symbol`-node lookup). Shared `extractTerms`.
- **Fusion ranker** (`fuse`, the core, FR-26): **weighted Reciprocal Rank Fusion** — rank-based so
  heterogeneous scores need no normalization; configurable per-signal weights (0 drops a signal);
  **per-candidate signal attribution**; returns one ranked set. Zod-validated hybrid service runs
  retrievers in parallel and fuses (the API/MCP search seam).
- Effect **E-012** (Retriever + fusion ⇒ retrievers + conformance + compiler/API consumers).

**Scope note (acceptance "five" vs requirements):** requirements are FR-21/22/23/25/26 = 4 retrievers
+ fusion. **Temporal (FR-24) is R1/F-018** — the 5th, behind the same interface; intentionally out of
scope here. Meaningful fusion needs a consistent cross-backend `ref` space — an ingestion/config seam.

**Evidence/verification (fresh):** build · typecheck · lint · format green; test = core 15 +
ai 4 (+8 skipped) + storage 19 + ingestion 25 + memory 25 + knowledge-graph 23 + **retrieval 23** =
**134 passing** (fusion math/weights/attribution, FTS5 keyword, semantic nearest, graph effect-expand,
symbolic exact/prefix, hybrid multi-signal fusion + weights + validation). verify-state valid.

**Lesson:** [[hybrid-fusion-shared-ref-space]] — RRF fuses by rank (no score normalization needed);
but signals only combine when retrievers share a `ref` id space, which is a corpus-wiring requirement.

**Next step:** **F-010** — Context Compiler (plan→retrieve→expand→rank→dedup→compress→assemble +
provenance), consuming this retrieval + the knowledge graph; unblocked by F-009.

---

## 2026-06-29 — F-008 DONE: Knowledge graph + effect-links + get_effects (@tessera/knowledge-graph)
**What changed** (ARCHITECTURE §5/§10; FR-16/17/18/19)
- New `@tessera/knowledge-graph` (deps: core, storage, drizzle-orm, zod).
- **Model:** `GraphNode` (file/symbol/module/person/decision/memory) + `GraphEdge` (imports/calls/
  references/contains/owns/defines/supersedes/**EFFECT_LINK**); deterministic `nodeIdFor`/`edgeIdFor`
  for idempotent upserts. Effect-links carry rationale/confidence/origin (static|manual|learned).
- **Effect-links (FR-17/18):** asserted **manually** via the service, and **derived statically** by
  inverting dependency edges (`A imports B` ⇒ `B --EFFECT_LINK--> A`, origin static).
- **get_effects (FR-19):** ranked, path-bearing traversal of dependents. Score = product of edge
  confidences; ranked score desc → distance asc → id asc.
- **GraphStore port + adapters:** in-memory (cycle-guarded BFS) + **sqlite (recursive CTE**,
  ARCHITECTURE §10, path-string cycle guard); both feed one shared `selectBestRanked` so results are
  identical (parity). One conformance suite covers both. Zod-validated service = the API/MCP seam.
- Effects **E-002** (realized) + **E-011** (GraphStore ⇒ adapters + conformance + service).

**Evidence/verification (fresh):** build · typecheck · lint · format green; test = core 15 +
ai 4 (+8 skipped) + storage 19 + ingestion 25 + memory 25 + **knowledge-graph 23** = **111 passing**
(ranking, static-derivation, service incl. get_effects ranking/paths/NotFound, both adapters'
conformance, sqlite CTE multi-hop). verify-state valid.

**Lesson:** [[adapter-parity-shared-pure-core]] — when two adapters must return identical results
(in-memory vs SQL traversal), factor the ranking/selection into one pure function both call; the
conformance suite then proves parity instead of re-deriving it per adapter.

**Next step:** **F-009** — Hybrid retrieval (semantic + keyword + graph + symbolic + fusion;
unblocked by F-004 + F-008), then F-010 (context compiler).

---

## 2026-06-29 — F-007 DONE: Memory subsystem (@tessera/memory)
**What changed** (ARCHITECTURE §5; FR-10/11/12/13)
- New `@tessera/memory` (deps: `@tessera/core`, `@tessera/storage`, `drizzle-orm`, **`zod`** —
  first workspace use of Zod, per ADR-0002).
- **Domain:** 7 `MEMORY_KINDS` (decision/lesson/incident/failure/architecture/glossary/task) +
  `MemoryMetadata` (source/author/links/tags); `Memory` = one **immutable version** with
  `version`, `supersedes`, `supersededBy`, `scope`, `confidence`, timestamps. Current =
  `supersededBy === null`.
- **Versioning (FR-12):** editing **never mutates** — it appends version N+1 that supersedes the
  prior; only the prior's `supersededBy` back-pointer is set. Atomic in the store (sqlite: a txn).
- **Service (FR-13):** Zod-validated `MemoryService` (`capture`/`edit`/`getCurrent`/`history`/
  `list`) — the **API + MCP seam** (F-011/F-012 wrap this domain service; not HTTP/MCP wiring here).
- **Port + adapters:** `MemoryStore` with **in-memory** (reference) + **sqlite** (Drizzle
  `memories` table over storage's `SqliteStore.db`; `CREATE TABLE IF NOT EXISTS` — drizzle-kit
  migrations are F-024) adapters, both passing one conformance suite. Effect **E-010**.

**Evidence/verification (fresh):** build · typecheck · lint · format green; test = core 15 +
ai 4 (+8 skipped) + storage 19 + ingestion 25 + **memory 25** = **88 passing** (validation,
service versioning, both adapters' conformance, sqlite service round-trip proving persistence +
immutability). verify-state valid.

**Lesson:** [[zod-exactoptional-bridge]] — Zod `.optional()` infers `T | undefined`, which clashes
with `exactOptionalPropertyTypes`; bridge by widening the mapper's param to `| undefined` and
stripping undefined keys when building the domain object.

**Next step:** **F-008** — Knowledge graph + effect-links + get_effects (unblocked by F-006),
then F-009 (hybrid retrieval).

---

## 2026-06-29 — F-006 DONE: Ingestion subsystem (@tessera/ingestion)
**What changed** (the front of the pipeline — ARCHITECTURE §7; FR-1/2/3/6/7/8/9)
- New `@tessera/ingestion` (deps: `@tessera/core`, `@tessera/storage`; **no new runtime deps**).
- **Ports (plugin SDK + persistence seam):** `Connector` (`list`/`resolve`), `Processor` +
  `runPipeline`, `DocumentSink`, `IngestionManifest` (content-hash index). ADR-0015.
- **Connectors:** `filesystem` (recursive walk, ignores `.git`/`node_modules`/`dist`/`.turbo`,
  traversal-guarded keys) + `git` (shells out to the `git` CLI — `ls-files -z` tracked files
  honoring `.gitignore`; repo provenance: branch/HEAD commit/authorship/tags). Shared
  `diffEntries` computes added/modified/removed.
- **Processors:** `normalize` (BOM strip, CRLF→LF, content-preserving) + `redact`. **Redaction is
  appended by the worker as a terminal, non-bypassable stage** so secrets are scrubbed before any
  persist (FR-9). `redactSecrets` = curated, ReDoS-safe detectors (AWS/GitHub/Slack/Google/Stripe
  tokens, PEM private keys, JWT, bearer, basic-auth URLs, quoted credential assignments); findings
  are **counts only**, never the secret value.
- **Pipeline:** `coordinator.scan()` diffs source vs manifest → enqueues **only changes** on the
  `Queue` port; `worker` consumes, resolves via connector, runs `normalize → … → redact`, and
  upserts to the sink **only if the content hash is new** (idempotent + incremental — no full
  re-index). Deterministic `documentIdFor` keeps upserts stable. In-memory sink + manifest adapters.

**Scope honesty:** embedding/vector/relational/graph **persistence** is the `DocumentSink` seam for
F-007/8/9 (not wired here); full git history/diff/blame + `fs.watch` deferred (ADR-0015). E-008
(ingestion as Embeddings consumer) realized at the later embed-processor increment.

**Evidence/verification (fresh):** build · typecheck · lint · format green; test =
core 15 + ai 4 (+8 guarded skipped) + storage 19 + **ingestion 25** = **63 passing** (connector
conformance, fs + **git** integration [ran for real], full pipeline lifecycle proving
incremental/idempotent/redaction). verify-state valid. Effect **E-009** added.

**Lesson:** [[ingestion-redaction-terminal-gate]] — make security invariants structural (enforced
pipeline stage), not advisory. Also: a stray NUL crept into a generated source file once; rewrote
it clean (watch for non-ASCII/control chars in emitted code).

**Next step:** **F-007** — Memory subsystem (types, metadata, versioning, manual capture), or
**F-008** (knowledge graph + effect-links, now unblocked by F-006).

---

## 2026-06-28 — F-005 DONE: Embeddings port + adapters (@tessera/ai)
**What changed**
- New `@tessera/ai`. `Embeddings` port (embed/embedBatch + {model, dimension} metadata, ADR-0006).
- Adapters: **transformers** (Transformers.js, local default, zero keys — smoke-verified live:
  `Xenova/all-MiniLM-L6-v2` → 384-d, ~21s first run incl. download), **ollama** (HTTP, optional),
  **fake** (deterministic, dependency-free — drives the conformance gate offline).
- Conformance suite runs against `fake` (4 tests, always); transformers + ollama tests **guarded**
  by env (`TESSERA_TEST_TRANSFORMERS` / `TESSERA_TEST_OLLAMA`), skipped by default. Effect **E-008**.

**De-risk:** smoke-tested a real embed before writing the adapter (confirmed model download +
mean-pooled/normalized 384-d output on Windows).

**Evidence/verification (fresh, cache off):** typecheck · lint · format · build green;
test = core 15 + ai 4 (+8 guarded skipped) + storage 19 = **38 passing**. verify-state valid.

**Note:** real adapter tests are guarded to keep gates fast/offline; transformers verified live
once via smoke + the opt-in `TESSERA_TEST_TRANSFORMERS=1` suite.

**Next step:** **F-006** — ingestion (filesystem + Git, event-driven, incremental, secret-redacted).

---

## 2026-06-28 — F-004 DONE: VectorStore port + sqlite-vec adapter
**What changed**
- `VectorStore` port (upsert/query/delete, capabilities {metric, dimension}, **model recorded
  per vector** — ADR-0006) in `@tessera/storage`.
- **sqlite-vec** adapter: better-sqlite3 + sqlite-vec v0.1.9 (prebuilt, loads on Windows);
  `vec0(id TEXT PRIMARY KEY, embedding float[N], model TEXT)`; KNN via
  `embedding MATCH ? ORDER BY distance LIMIT ?`; upsert = replace-by-id; dimension validated.
- Vector conformance suite (6 tests) + integration test on `:memory:`. Effect **E-007** updated
  to include VectorStore + sqlite-vec + vector conformance (+ pgvector later).

**De-risk:** smoke-tested sqlite-vec extension loading + vec0 KNN on Windows before writing the
adapter (confirmed v0.1.9 prebuilt works; learned exact API).

**Evidence/verification (fresh, cache off):** typecheck · lint · format · build green;
test = core 15 + storage 19 = **34**. verify-state valid.

**Next step:** F-005 — Embeddings port + Transformers.js adapter (Ollama optional).

---

## 2026-06-28 — fix: @tessera/storage was gitignored (never committed) — now tracked
**Bug (caught by the project lead):** a bare `.gitignore` rule `storage/` (meant for a runtime
data dir) also matched the SOURCE package `packages/storage/`, so the **entire F-003 package was
excluded from git**. The earlier "F-003" commits contained the state/docs changes but **none of
the storage code**, and `git status` showed "clean" the whole time (ignored files are hidden).
Detected via `git ls-files packages/storage` → 0.
**Fix:** anchored/dot-prefixed the runtime-data ignores (`/data/`, `.data/`, `.tessera/`,
`.vectordb/`; removed bare `data/` and `storage/`); committed the package. Lesson
[[gitignore-broad-dir-hid-package]]; clean-state protocol now requires confirming new dirs are
tracked via `git ls-files`.
**Verification:** `git ls-files packages/storage` > 0 after commit; gates unchanged (code identical).

---

## 2026-06-28 — F-003 DONE: storage ports + 3 adapters + conformance
**What changed (inc 4 + close)**
- SQLite `RelationalStore` adapter: **better-sqlite3** (^12, prebuilt — no native compile) +
  **Drizzle** (^0.45); lifecycle (migrate/healthcheck/close) + typed `db` handle; relational
  conformance suite + a Drizzle round-trip integration test.
- `@tessera/storage` now: **3 ports + 3 local adapters** (sqlite, filesystem, in-process queue),
  each validated by a shared conformance suite. Effect **E-007** (storage port ⇒ adapters + suites).

**Evidence/verification (fresh, cache off):** typecheck · lint · format · build green;
test = core 15 + storage 13 = **28**. verify-state valid.

**Decisions:** SQLite driver = **better-sqlite3** (delegated to Claude; mature, Drizzle-proven,
prebuilt binary so no Windows compile). node:sqlite was the fallback — not needed.

**Next step:** **F-004** — VectorStore port + sqlite-vec adapter (semantic retrieval).

---

## 2026-06-28 — F-003 inc 3: filesystem BlobStore + turbo cache fix
**What changed**
- Filesystem `BlobStore` adapter (`node:fs`, traversal-safe keys) + blob conformance suite
  (`tests/conformance/blob.conformance.ts`) + integration test (temp dirs); exported from index.
- **Build fix:** turbo served **false-green cached** gate results for uncommitted changes
  (input hash didn't change on working-tree edits). Set `"cache": false` on
  build/typecheck/lint/test in `turbo.json`. Lesson captured:
  [[turbo-cache-stale-uncommitted]].

**Evidence/verification (fresh, cache bypassed):** typecheck · lint · format · build all
execute & pass; **test: core 15 + storage 9 = 24** (storage now correctly runs both queue +
blob suites). verify-state valid.

**Remaining for F-003:** inc 4 = SQLite `RelationalStore` (Drizzle + **better-sqlite3**,
fallback node:sqlite) + relational conformance. Effect E-007 added when F-003 closes.

**Next step:** F-003 inc 4 (SQLite RelationalStore).

---

## 2026-06-28 — F-003 (in progress): storage ports + in-process queue [inc 1-2]
**What changed**
- New `@tessera/storage` package. Ports: `RelationalStore` / `BlobStore` / `Queue`
  (`src/ports/`). In-process `Queue` adapter (microtask delivery, retry up to maxAttempts,
  drain-on-shutdown) using `@tessera/core` errors.
- **Queue conformance suite** in `tests/conformance/` (ADR-0014) + `tests/integration` run
  against the in-process adapter (4 contract tests).

**Evidence/verification (green, executed):** typecheck · lint · format · test (core 15 +
storage 4 = 19) · build. verify-state valid (31 features, 6 effect-links).

**Remaining for F-003:** inc 3 = filesystem `BlobStore` + blob conformance; inc 4 = SQLite
`RelationalStore` (Drizzle + a driver — leaning **better-sqlite3**, ADR at that point) +
relational conformance + drizzle-kit migrations. Effect **E-007** (storage port ⇒ adapters +
conformance) added when F-003 closes.

**Next step:** F-003 inc 3 (filesystem `BlobStore`).

---

## 2026-06-28 — Decision: test organization = hybrid (ADR-0014)
**What changed** (convention, after research + lead's question)
- [ADR-0014](../../docs/adr/0014-test-organization-hybrid.md): **unit tests co-located** in
  `src/` (white-box, short imports, refactor-safe); **integration + e2e + port conformance
  suites** in a separate per-package `tests/` dir (app e2e in `apps/*/tests/e2e`, `apps/web/e2e`).
- Codified in [`rules/common/testing.md`](../rules/common/testing.md) (new Layout section);
  ADR index updated.
- `@tessera/core`'s current tests are all unit → stay co-located (no move).

**Decision** (AskUserQuestion): hybrid chosen over full-separation (brittle `../../src`
imports + mirrored tree) and over co-locate-everything (integration/e2e don't map to one file).

**Evidence/verification:** link-check + verify-state (this session).
**Next step:** **F-003** — storage ports + SQLite/filesystem adapters + conformance suite
(first feature to use `tests/integration` + `tests/conformance`).

---

## 2026-06-28 — F-002 DONE: @tessera/core domain primitives
**What changed**
- Fleshed out `@tessera/core` (was a shell): `id.ts` (branded `Id<Brand>`, `newId` via
  `node:crypto`, `isId`), `errors.ts` (`TesseraError` + Validation/NotFound/Conflict/
  Unauthorized/Forbidden/Internal + `ErrorCode`), `result.ts` (`Result`/`ok`/`err`/`isOk`/
  `isErr`), `config.ts` (`DeploymentProfile`, `DEPLOYMENT_PROFILES`, `CoreConfig`, guard),
  `events.ts` (typed in-process `createEventBus`). `index.ts` re-exports all.
- Config: core `tsconfig` `types:["node"]` (for node:crypto); eslint `no-undef:off` (TS handles it).
- Effect **E-006**: @tessera/core public API → every package/app (change additively).

**Evidence/verification** (executed, green)
- typecheck ✓ · lint ✓ · format:check ✓ · test ✓ (**6 files, 15 tests**) · build ✓ (emits dist).
- `verify-state` valid.

**Decisions**
- Node-targeted core (uses `node:crypto`); browser consumers use the SDK/API, not core directly.
- `Result` type provided for explicit domain failures alongside thrown `TesseraError`.

**Next step:** **F-003** — storage ports + SQLite/filesystem adapters + conformance suite.

---

## 2026-06-28 — Phase B.3: general-purpose execution skills (ECC-adapted) [F-031 done]
**What changed** (general-purpose harness layer; the gap the lead flagged)
- New skills (tool-agnostic, MIT-adapted from ECC — see [`NOTICE.md`](../../NOTICE.md)):
  [`strategic-compact`](../skills/strategic-compact/SKILL.md) (compact at phase boundaries),
  [`continuous-learning`](../skills/continuous-learning/SKILL.md) (lessons →
  [`memory/lessons/`](../memory/lessons/)), [`coding-standards`](../skills/coding-standards/SKILL.md)
  (indexes the rules).
- Enriched [`rules/common/engineering.md`](../rules/common/engineering.md) (KISS/DRY/YAGNI,
  small functions, no magic numbers, parallel async) + [`testing.md`](../rules/common/testing.md) (AAA).
- **Wired into protocols** (not fragile hooks): strategic-compact in workflow + session-lifecycle;
  continuous-learning in clean-state + definition-of-done. `.claude/skills` shims added.
- ADR-0013 (adopt ECC-derived skills; hooks deferred; broader agents/commands added as we code).
  ADR-0012 marked retired (agy). Memory: `ecc-harness-reference`.

**Decisions** (delegated to Claude): adopt the 3 named skills only (not broader ECC
agents/commands yet); **wire into protocols, defer executable hooks** (Windows-fragile,
upkeep) — record as optional future enhancement.

**Evidence/verification:** link-check + verify-state (this session's verify run).

**Next step:** **F-002** — `@tessera/core` (ids, typed errors, config types, event bus).

---

## 2026-06-28 — F-001 DONE: monorepo & toolchain scaffold
**What changed** (first coding feature; activates the verification gates)
- Turborepo + pnpm workspace: `package.json` (scripts→gates), `pnpm-workspace.yaml`,
  `turbo.json` (tasks), `tsconfig.base.json` (strict: noUncheckedIndexedAccess,
  exactOptionalPropertyTypes, noImplicitOverride, verbatimModuleSyntax, NodeNext).
- ESLint 9 flat config (`eslint.config.mjs`) incl. **package-boundary rule** (ADR-0001);
  Prettier (scoped to code + root config; docs/harness excluded by design); Vitest.
- First package `@tessera/core` (shell: `VERSION`/`coreVersion()` + 2 tests) to prove the
  toolchain end-to-end. F-002 fleshes it out.
- CI: `.github/workflows/ci.yml` mirroring gates.json (ADR-0010) + `pnpm audit`; `.env.example`.
- Flipped `verification/gates.json` typecheck/lint/format/test/build → **active** (e2e stays
  pending). Added effect **E-005** (CI ⇄ gates.json must stay in lockstep).

**Evidence/verification** (all green, executed)
- `pnpm install` ok (turbo 2.10, eslint 9.39, ts 5.9, vitest 2.1, prettier 3.9).
- typecheck ✓ · lint ✓ · format:check ✓ ("All matched files use Prettier code style!") ·
  test ✓ (2 passed) · build ✓ (emits `packages/core/dist`).
- **Boundary rule proven:** a deliberate `@tessera/other/src/x` import made `lint` FAIL
  (exit 1, no-restricted-imports); removing it returned lint to green.
- `node scripts/verify-state.mjs` valid (30 features, 5 effect-links).

**Decisions**
- Prettier scoped to code + root config only (markdown/docs/.harness hand-maintained) — a
  pragmatic scoping, revisit if we want prettier on docs. Type-aware ESLint deferred until
  real domain packages exist (F-002+); scaffold uses recommended + boundary rule.

**Next step:** **F-002** — `@tessera/core` (ids, typed errors, config types, event bus).

---

## 2026-06-28 — agy/Gemini worker integration removed (decision: not using agy)
**Decision:** we will **not** use `agy`/Gemini as a sub-agent in this project. The build-phase
worker integration added earlier (commit `e6713c2`) is fully removed: deleted ADR-0012, the
`delegate-to-worker` skill, the `/delegate` command + skill shim, and `scripts/agy-worker.ps1`
/`.sh`; removed feature F-031; stripped the agy section from `governance/tool-access.md` and the
references in the ADR index, skills index, `policy-model.md`, and coverage matrix. History is
preserved (this is a forward removal commit, not a rewrite). The decision is recorded in
[`REQUIREMENTS-COVERAGE.md`](../../docs/REQUIREMENTS-COVERAGE.md) so it isn't re-proposed.

**Evidence/verification:** verify-state valid; internal link-check 0 broken (this session).

**Next step:** coding — claim **F-001** (scaffold).

---

## 2026-06-27 — Phase B.1 addendum: governance policy model + ecosystem positioning
**What changed** (after reviewing Databricks **Omnigent**, a meta-harness)
- Added [`.harness/governance/policy-model.md`](../governance/policy-model.md): static +
  **stateful/contextual** policies (scopes, post-action triggers, resource-scoped writes,
  cost budgets, **egress-proxy credential injection**), with an honest enforcement matrix.
  Wired into governance README + tool-access.
- Product positioning: PRD **NG7** (Tessera is *not* an orchestrator) + new **§5.1 Ecosystem
  & interoperability**; ARCHITECTURE §2 "Ecosystem position". Tessera = MCP context/memory
  layer **complementary** to meta-harnesses (Omnigent); it fills Omnigent's context gap.

**Decision** (AskUserQuestion): adopt the stateful governance model + interoperability
positioning; do **not** build orchestrator/sandbox/live-session infra (out of scope).

**Next step:** coding — claim **F-001** (scaffold).

---

## 2026-06-27 — Phase B.1: pre-code hardening (gaps from brief review)
**What changed**
- Added the **design system**: [`docs/design/DESIGN-SYSTEM.md`](../../docs/design/DESIGN-SYSTEM.md)
  (tokens via tweakcn/shadcn, layout via efferd, components via coss/shadcn, motion, full UX
  baseline, a11y, perf) + **ADR-0009** (frontend stack locked; responsive web, **not PWA**).
- Captured two dropped brief items: **ADR-0011** billing via Dodo Payments (R2 direction) and
  **ADR-0010** CI/CD via GitHub Actions. Updated the ADR index.
- Added [`docs/REQUIREMENTS-COVERAGE.md`](../../docs/REQUIREMENTS-COVERAGE.md) tracing the
  entire original brief → PRD/ADR/harness, or gap.
- PRD: +FR-61 (billing), +NFR-15 (CI/CD), +NG6 (no PWA), design-system references.
- Code harness made explicit: [`F-001 scaffold plan`](../plans/F-001-monorepo-toolchain-scaffold.md)
  (tsconfig strict flags, eslint boundary rule, prettier, vitest, turbo, CI, scripts→gates);
  frontend rule now binds to the design system.
- State: +F-028 (UI foundation, R0), +F-029 (CI/CD), +F-030 (billing, R2); F-014 now
  blockedBy F-028; +effect E-004 (design tokens → all components).

**Evidence/verification**
- `node scripts/verify-state.mjs` valid (30 features, 4 effect-links); link-check 0 broken
  (see verification run for this session).

**Decisions** (via AskUserQuestion): capture billing now/build R2 (Dodo); responsive web not
PWA; lock frontend stack ADR now.

**Next step**
- Coding phase: claim **F-001** (scaffold) — plan already written.

---

## 2026-06-27 — Phase B: agent harness built
**What changed**
- Built the tool-agnostic global harness under [`.harness/`](../) plus root
  [`AGENTS.md`](../../AGENTS.md) (mandatory) and [`CLAUDE.md`](../../CLAUDE.md).
- Authored: instructions (workflow, session-lifecycle), modular rules
  (common/typescript/api/frontend/security), skills (add-feature, write-adr, effect-trace,
  verify-gate), commands (next-feature, verify, checkpoint), protocols (initialization,
  verification, definition-of-done, clean-state, effect-link, observability), governance
  (commit, secrets, tool-access, adr), plans (README + TEMPLATE), verification
  (gates.json + checklist).
- Seeded state: this log, [`feature_list.json`](feature_list.json) (R0 features F-001…F-016
  detailed + R1–R3 backlog F-017…F-027), [`effects.json`](effects.json) (invariants
  E-001…E-003), and JSON schemas.
- Added the Claude Code adapter ([`.claude/`](../../.claude/)) with settings, command shims,
  and planner/generator/evaluator subagents.
- Added `scripts/init.ps1` + `init.sh` + `scripts/verify-state.mjs`.
- Added service-scoped harness stubs under `apps/api` and `apps/web` (extend root).

**Evidence/verification**
- `node scripts/verify-state.mjs` — state files valid (see Phase B verification entry).
- Internal markdown link-check across the harness — 0 broken.

**Decisions**
- Harness is agnostic-core (`.harness/`) + thin Claude adapter (`.claude/`), mirroring the
  product's agent-agnostic stance. Recorded in memory [[harness-model]].

**Next step**
- Begin the coding phase: claim **F-001** (monorepo & toolchain scaffold) via
  [`/next-feature`](../commands/next-feature.md); that activates the pending-toolchain gates.

---

## 2026-06-27 — Phase A: product definition shipped
**What changed**
- Brand finalized **Tessera** / `@tessera/*` (ADR-0008; supersedes ContextOS).
- Wrote [`docs/PRD.md`](../../docs/PRD.md) (FR-*/NFR-* ids), 
  [`docs/architecture/ARCHITECTURE.md`](../../docs/architecture/ARCHITECTURE.md),
  ADRs 0001–0008 (Accepted), glossary, roadmap; repo hygiene; `git init`.

**Evidence/verification**
- Internal link-check: 78 links, 0 broken. Branding scan: only intentional codename refs.
- Committed as `aaaf84f` (genesis commit on `main`, no remote).

**Decisions**
- Locked Drizzle (ADR-0005), Transformers.js/Ollama + sqlite-vec→pgvector (ADR-0006).

**Next step**
- Phase B (harness) — done in the entry above.
