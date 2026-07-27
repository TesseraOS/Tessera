# Plan: F-057 Analytics & usage — per-tenant metering, persistent subscriptions, analytics + billing UI

- **Feature:** F-057 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-47 (analytics: retrieval quality, usage, cost, latency — [`PRD`](../../docs/PRD.md) L212),
  NFR-12 (cost control: *"cloud tracks per-tenant usage/cost"* — L278), FR-61 (billing behind a port — L231)
- **Service / package:** `web` — but the work runs `@tessera/billing` → `@tessera/config` →
  `@tessera/api` + `@tessera/mcp` → `@tessera/sdk` → `@tessera/web`
- **Author:** planner subagent + implementing agent · **Date:** 2026-07-27
- **Decision:** [ADR-0060](../../docs/adr/0060-usage-metering-analytics-and-the-metered-predicate.md)
- **Effects:** E-019, E-003, E-004, E-014 (declared) + **new E-029**, E-013, E-026 (found in planning)

---

## Intent

Two entitlement numbers in [`domain.ts`](../../packages/billing/src/domain.ts) have never been read by
anything: `maxMonthlyCompiles` and `maxSeats`. One in-memory `Map`
([`subscription-store.ts:9`](../../packages/billing/src/subscription-store.ts)) is the only place a paid
plan lives, so a restart silently downgrades every paying tenant to free. And FR-47's Analytics view does
not exist at all.

This feature builds the persistent per-tenant usage store those numbers need, feeds it **once** at each
surface boundary, closes the F-035 monthly-compile seam through it, exposes it at `GET /v1/usage`,
persists subscriptions across restarts, and renders an Analytics and a Billing view over the result.

**Done looks like:** an admin opens `/analytics` and sees numbers that came out of a database — compiles,
searches, ingested documents, tokens compiled, per-operation latency — that survive a restart; opens
`/billing` and sees the plan, entitlements, usage against those limits, and (on a metered deployment) an
upgrade through the existing Dodo port; and a tenant that has burned its monthly compile entitlement is
refused on **both** REST and MCP by one implementation.

---

## The bug this feature must not amplify (verified, not assumed)

`createRuntimeBilling` returns `createLocalBilling()` when `billing.provider` is `none`
([`assemble.ts:151`](../../packages/config/src/profiles/assemble.ts)); that adapter resolves every tenant
to `freeSubscription` ([`local.ts:14`](../../packages/billing/src/adapters/local.ts)); the free plan caps
`maxTokensPerCompile` at 8000 ([`domain.ts:38`](../../packages/billing/src/domain.ts)); and
`createCompileBudgetClamp(services.billing)` treats *any* defined provider as metered
([`budget.ts:32`](../../packages/billing/src/budget.ts)).

**So every runtime-composed Local and self-hosted deployment is already clamped to 8000 tokens per
compile** — while `budget.ts:21-27` documents in prose that precisely this must not happen, and
[ADR-0056 §3](../../docs/adr/0056-entitlement-clamp-silent-and-metered-only.md) decided it must not. The
decision was made and the composition root never implemented it. The Inspector's 32000 preset
([`compile-form.tsx:16`](../../apps/web/components/inspector/compile-form.tsx)) is being silently reduced
today.

If `maxMonthlyCompiles` were enforced under that same predicate, **every local and self-hosted deployment
would be hard-blocked after 200 compiles per calendar month** — the F-056 lesson ("a shortcut that caps a
deployment profile") applied to *all* profiles at once. Hence ADR-0060 §1 and increment 6a.

---

## Scope

### In scope — the four acceptance clauses, and nothing else

1. Persistent per-tenant usage store (compiles / searches / ingested docs / tokens, time-bucketed), fed at
   the API/MCP boundary; monthly-compile entitlement enforcement; `GET /v1/usage` (admin-guarded, OpenAPI + SDK).
2. Persistent `SubscriptionStore` for both profiles; webhook-driven updates verified.
3. Analytics view + Billing view, provenance-first, Recharts per DESIGN-SYSTEM.
4. axe AA + screenshots; e2e including metered request → usage visible; workspace gates green.

### Out of scope — named so their absence reads as a decision, not an oversight

- **Seat enforcement** (`maxSeats`). The acceptance names monthly compiles only, and there is no seat model
  to count against — a token is not a seat. Stays display-only; E-019 must keep saying so.
- **A cost figure in currency.** The only money in the system is `Plan.priceCents`; there is no per-token
  price and no provider bill. Clause 3 says *cost posture*, and the honest posture is: which embeddings
  provider is in use (local ⇒ no API spend, which is literally NFR-12's claim), the plan price, and tokens
  compiled. A fabricated dollar amount is what DESIGN-SYSTEM §0 forbids.
- **A metrics/scrape endpoint, OTLP exporter, or meter provider.** That is observability's own recorded
  seam (E-015), not this feature. See ADR-0060 §3.
- **Usage retention/pruning.** Usage is billing evidence; deleting it destroys the invoice basis. Growth is
  bounded and stated (ADR-0060 §4).
- **Per-principal usage.** Deliberately refused — it would turn an aggregate counter into personal data
  subject to NFR-13 DSR export *and* erasure, and erasing it would destroy billing evidence. "Who" is
  already answered by the audit trail.
- **An MCP `get_usage` tool.** ADR-0053's rule: an agent has no use for a usage histogram.
- **Auditing the billing routes.** `billing.read`/`billing.manage` exist in the vocabulary
  ([`model.ts:27`](../../apps/api/src/audit/model.ts)) but no billing route sets `config.audit` — a real
  latent gap, found in planning, **refused here as scope creep** and filed as a backlog feature instead
  (golden rule 2).
- **F-092** (shiki contrast), **F-094** (type-aware lint). Do not absorb.

---

## What is already true (verified in the tree)

1. **The F-030 seam is one line, in the profile-*independent* half of the composition root.**
   `store: createInMemorySubscriptionStore()` at `assemble.ts:148`. A persistent store therefore cannot be
   built there — it must arrive on `ProfileAdapters` (`assemble.ts:72-93`) exactly like `tokenStore` and
   `auditLog`, which is what makes the compiler ask **both** profiles for it. That is the F-056 mechanism,
   and it is why "SQLite only" is not an option.
2. **The `SubscriptionStore` port has no conformance suite.** Three adapters with no shared contract is the
   F-078 divergence waiting to happen.
3. **The F-035 seam is precisely: nothing reads `maxMonthlyCompiles`.** A workspace grep returns only the
   definition, a unit assertion, marketing copy, the API schema, and two dashboard *display* sites.
   `effects.json` E-019 states the remaining work in its own words.
4. **`createCompileBudgetClamp` is the precedent to copy** — one implementation in `@tessera/billing`,
   consumed by `apps/api/src/routes/v1/compile.ts:19` and `apps/mcp/src/server.ts:223`. ADR-0056 §4 makes
   "one implementation, both surfaces" standing. The monthly guard is built the same way or it drifts.
5. **The audit recorder is the hook shape metering should copy** —
   [`recorder.ts:30-52`](../../apps/api/src/audit/recorder.ts): one `onResponse` hook keyed on a per-route
   `config.audit` marker, registered once, **failure-isolated**. One hook per surface is what makes "fed
   once, not twice" structural rather than a review comment.
6. **Latency is already on the reply** — `reply.elapsedTime`, used at `apps/server/src/api.ts:77`. Free.
7. **The compiler already produces the retrieval-quality proxies** — `PackageScores` =
   `{ fragmentCount, budgetAdherence, provenanceCoverage, redundancy }`. FR-47 needs accumulation, not new
   computation.
8. **`buildServer({})` must keep working** — `packages/sdk/scripts/generate.mjs:14` boots it with empty
   services to capture OpenAPI. A new route must register without a store and answer cleanly when it has
   none (the `/v1/sources` 409 idiom).
9. **The `instrumentServices` trap is avoidable by construction** — this plan adds **no `ApiServices`
   member**; the usage store rides `BuildServerOptions` beside `audit`/`tokenStore`. That is the F-063
   precedent and it makes E-015 structurally N/A.
10. **The Postgres store template is proven** — `Migration[]` per package, `pgXMigrations` beside the
    adapter, concatenated into `ALL_MIGRATIONS` and applied once under `pg_advisory_lock`
    (`self-hosted.ts:56-66,120-122`), with a per-test schema via `search_path`.
11. **`admin:manage` already exists** (`apps/api/src/auth/model.ts:39`), owner/admin-only. `/v1/usage` needs
    **no** RBAC-catalog change — which matters, because a new permission ripples
    `GET /v1/rbac` → OpenAPI → SDK → the dashboard's token-scope UI.
12. **`RateLimitedError` → 429 already exists in the shared envelope.** An entitlement refusal reuses it:
    no new error code, no envelope/SDK ripple.
13. **The web app has TWO nav definitions** — `components/app-shared.tsx:36-91` (sidebar) and
    `lib/nav.ts:27-55` (⌘K palette). **Both** must be edited or the palette and sidebar disagree about
    whether Analytics exists. Do not "fix" the duplication here; add a test that they agree.
14. **The web e2e already boots a real API** — `playwright.config.ts:20-38` starts a real Local runtime.
    "Metered request → usage visible" belongs there: a real compile against a real store, not a `page.route` stub.
15. **`activity()` is the honesty precedent for a time series** — aggregate **at the store**, and return the
    `from` the server actually used so a pruned day is never drawn as a zero (ADR-0053 clause 3).
16. **The generated-artifact chain is load-bearing** — a new route ⇒ `@tessera/sdk generate` **and**
    `@tessera/docs generate`, byte-compared by `generated-drift.test.ts` inside the **`test`** gate.
    Same-increment work, never a follow-up.
17. **`documents ingested` is not a boundary fact.** `POST /v1/sources/:id/scan` returns 202 since F-081;
    documents are written later by the queue worker, which emits `document.ingested` carrying its `scope`.
    The truthful feed is a subscriber beside the SSE bridge in `assembleRuntime` (`assemble.ts:223-231`).
    Metering the scan *request* would count intent, not documents.

---

## Decisions (ADR-0060) — the two marked ⚑ were taken by the project lead

- **§1 ⚑ Who is metered: an explicit `metered` flag**, `metered = config.billing.provider !== 'none'`,
  threaded through `createRuntimeBilling` into **both** the token clamp and the new monthly guard.
  Local/self-hosted become unmetered for both. This *fixes* the shipped 8000-token cap, realizing what
  ADR-0056 §3 already decided. Its own increment and its own commit (6a) so a regression bisects cleanly.
- **§2 Where the contract lives: `@tessera/billing`**, beside the entitlements it enforces. It gains
  `@tessera/storage` + `drizzle-orm` — the dependency set `@tessera/memory` already carries. Rejected: a
  `@tessera/usage` package (splits the counter from the limit it serves) and `@tessera/api` (would make the
  MCP surface import a Fastify package).
- **§3 ⚑ Latency comes from the boundary**, stored as `count` / `sumDurationMs` / `maxDurationMs`, and
  reported as **"average"** and **"slowest"** — never p95. A sum and a max cannot produce a percentile;
  labelling a mean as p95 would be fabrication. True p95 stays in the gated `bench` suite against NFR-4.
- **§4 Schema:** UTC day buckets, typed columns, **no `principal_id`** (DSR reasoning above), `project_id`
  recorded so Analytics can scope while the monthly entitlement sums across projects (a subscription is
  per-tenant). Aggregation happens **at the store**, never by paging rows into the API.
- **§5 One recorder per surface.** REST: one `onResponse` hook keyed on `config.meter`, failure-isolated,
  skipping `>= 400`. MCP: a `usage` option applied inside the `runTool` wrapper so it meters **with and
  without a gateway**. Ingestion: one `document.ingested` subscriber. Never both.
- **§6 The monthly guard:** one implementation, `RateLimitedError` (no new code), **fail-open** on store
  error — a metering outage that becomes a product outage is worse than a few uncounted compiles.
- **§7 Persistent `SubscriptionStore`** on `ProfileAdapters` as a **required** member, for both profiles,
  behind a conformance suite the port never had.
- **§8 `GET /v1/usage`:** `admin:manage`, store-aggregated, honest window (`from` = what the server used),
  **not audited** (an aggregate read on page load would flood the trail — the `/v1/stats` posture), no MCP tool.
- **§9 UI:** two views, provenance-first, single series on `--primary` (the F-091 rule in E-004), honest
  empty states, no currency.
- **§10 No config change** — `provider` already carries the metered signal. No new `TESSERA_*` var,
  therefore no `.env.example` churn.

---

## Approach — twelve increments, gates green between commits

**0 · Governance.** This plan + ADR-0060 + the index row; claim F-057. _Gate:_ `state`.

**1 · Usage contract + reference adapter + shared conformance.** `usage/ports.ts`, `usage/recorder.ts`,
`adapters/in-memory-usage-store.ts`, `tests/conformance/usage-store.conformance.ts`. No wiring.
_Tests:_ round-trip; same-bucket accumulation; tenant **and** project isolation; `summary()` window
clamping; month boundary at `23:59:59.999Z` / `00:00:00.000Z`.
_Mutation:_ dropping `tenantId` from the key ⇒ isolation red; `Math.max` instead of `+` ⇒ accumulation red;
`>=` for `>` on the boundary ⇒ boundary red.

**2 · SQLite + Postgres UsageStore** + `pgUsageMigrations`. **Both run the unmodified suite from 1.**
_Tests:_ the shared suite ×2; a real `ON CONFLICT DO UPDATE` (second `record()` neither raises nor
duplicates); `summary()` returns **numbers** — node-postgres hands back `sum()`/`count()` as strings, so
assert `typeof` explicitly.
_Mutation:_ removing `onConflictDoUpdate` ⇒ idempotence red; removing the `Number(...)` parse leaves loose
equality green but turns the `typeof` assertion red — which is the point.

**3 · Persistent SubscriptionStore + the suite the port never had**, run by **all three** adapters.
_Tests:_ upsert-then-get; upsert **replaces** (never two rows); `externalId`/`currentPeriodEnd: null`
round-trip; two tenants isolated.
_Mutation:_ making `upsert` an insert ⇒ replace red on all three adapters at once — the F-078 property this
suite exists to buy.

**4 · Composition-root wiring.** `ProfileAdapters` +`usageStore` +`subscriptionStore` (required); `local.ts`
supplies the SQLite pair, `self-hosted.ts` the Postgres pair + migrations; `createRuntimeBilling` takes the
store; `assemble.ts:148` deleted; `Runtime.usage`.
_Tests:_ the existing five `packages/config/tests/integration/*` files stay **unedited** — that is the proof
the change is additive. New guarded case: a subscription survives `close()` + re-`createRuntime` on **both**
profiles.
_Mutation:_ reverting to the in-memory store ⇒ persistence red on both profiles.

**5 · The three recorders.** REST hook + `config.meter` + `BuildServerOptions.usage`; MCP `usage` option in
`runTool`; the `document.ingested` subscriber; `apps/server` passes `runtime.usage`.
_Tests:_ one `POST /v1/compile` ⇒ **exactly one** row, `tokens === pkg.totalTokens`, non-zero duration; a
403'd compile records **nothing**; a throwing store does **not** fail the request.
_Mutation:_ recording in the handler *as well as* the hook ⇒ "exactly one" red — the double-counting guard
is a test, not a comment. Removing the `>= 400` skip ⇒ denied case red.

**6a · ⚑ The metered predicate — its own commit.** `metered` threaded from `config.billing.provider`
through `createRuntimeBilling` into `createCompileBudgetClamp`. Rewrite (do not delete)
`apps/api/tests/e2e/billing.e2e.test.ts` and `packages/billing/src/budget.test.ts`. Add a
"Superseded in part by ADR-0060 §1" note to ADR-0056.
_Tests:_ an **unmetered runtime-composed** server does not clamp — the assertion that did not exist and is
why the bug survived; an explicitly metered one clamps at the plan.
_Mutation:_ hard-coding `metered: true` ⇒ unmetered red; `false` ⇒ metered red.
_Gates:_ code set + `e2e` + **`e2e-full`** + **`bench`** (the effective Local compile budget changes).

**6b · The monthly guard (the F-035 closure).** `createMonthlyCompileGuard` adopted at
`routes/v1/compile.ts` and `apps/mcp/src/server.ts` for `compile_context` **and** `explain` (it calls
`compiler.compile`, so it spends the same resource).
_Tests:_ under limit ⇒ allowed; at limit ⇒ `RATE_LIMITED` with `details.limit`; `-1` ⇒ never refused;
unmetered ⇒ never refused; throwing store ⇒ **allowed** (fail-open, asserted). Parity e2e: same tenant, same
count, refused identically on REST and MCP.
_Mutation:_ `>=` → `>` ⇒ at-the-limit red; removing MCP adoption ⇒ parity red.

**7 · `GET /v1/usage` + SDK + docs.** `schemas/usage.ts`, `usage/summary.ts` (Fastify-free), `routes/v1/usage.ts`;
then `@tessera/sdk generate` + `getUsage()` and `@tessera/docs generate` **in the same commit**.
_Tests:_ 403 without `admin:manage`; 409 with no store; `from` clamped to the store's floor; project scoping;
`quality` is `null` for an empty window (a zero average is a lie about an empty set).
_Mutation:_ returning the *requested* `from` ⇒ floor case red.

**8 · Analytics view** + nav in **both** sources.
_Tests (RTL):_ loading/empty/error; chart renders only with data; latency reads "average"/"slowest" and
**never** "p95"; no currency symbol in the cost card.
_Mutation:_ hard-coding a sample array ⇒ empty-state red.

**9 · Billing view.**
_Tests (RTL):_ plan + entitlements + usage-vs-limit meter from real query data; the upgrade CTA is **absent**
on an unmetered deployment and present on a metered one; a checkout error surfaces through `ErrorState`.

**10 · e2e + a11y + screenshots.** Pass `runtime.usage` in `token-api-server.mjs`; `analytics.spec.ts`
**compiles through the real API** then asserts the number on `/analytics`; `billing.spec.ts`; axe AA on both;
screenshots 4 themes × light/dark.
_Mutation:_ the analytics spec must be **seen to fail** against increment 7's HEAD — a green-on-first-run e2e
proves nothing.

**11 · Effects + state.** `effects.json`, `progress.md`, `feature_list.json` → `done`, memory lesson.

---

## Files to touch

**`@tessera/billing`** — `src/usage/{ports,recorder,monthly-guard}.ts` (new);
`src/usage/adapters/{in-memory,sqlite,postgres}-usage-store.ts` (new);
`src/adapters/{sqlite,postgres}-subscription-store.ts` (new); `src/budget.ts` (`metered`); `src/index.ts`;
`tests/conformance/*` (new ×2); `tests/integration/*` (new ×6); `src/budget.test.ts` (rewritten);
`package.json` (+`@tessera/storage`, +`drizzle-orm`).

**`@tessera/config`** — `src/profiles/assemble.ts` (`ProfileAdapters` +2, `createRuntimeBilling` signature,
delete `:148`, the ingestion subscriber, `Runtime.usage`); `src/profiles/local.ts`;
`src/profiles/self-hosted.ts` (+2 migration sets); `src/runtime.ts`; `tests/integration/usage-persistence.test.ts` (new).

**`@tessera/api`** — `src/usage/{recorder,summary}.ts` (new); `src/schemas/usage.ts` (new);
`src/routes/v1/usage.ts` (new); `src/routes/v1/index.ts`; `src/server.ts` (`BuildServerOptions.usage`);
`src/routes/v1/{compile,search,memory}.ts` (`config.meter` + the guard + token annotation);
`tests/e2e/{usage,billing}.e2e.test.ts`.

**`@tessera/mcp`** — `src/server.ts` (`usage` option, guard on `compile_context`/`explain`, recording in
`runTool`); `tests/e2e/entitlements.e2e.test.ts` (monthly cases + REST/MCP parity).

**`@tessera/server`** — `src/api.ts`, `src/mcp.ts` pass `runtime.usage`.

**`@tessera/sdk`** — `openapi.json` + `src/generated/schema.ts` (**regenerated, never hand-edited**);
`src/client.ts` (`getUsage()`).

**`@tessera/web`** — `app/{analytics,billing}/page.tsx` (new); `components/{analytics,billing}/*` (new);
`lib/api/hooks.ts`; **both** `components/app-shared.tsx` and `lib/nav.ts`;
`tests/e2e/{analytics,billing}.spec.ts` (new); `tests/e2e/support/token-api-server.mjs`.

**Docs / generated** — `apps/docs/generated/*` + `content/docs/reference/api/**` (regenerated);
`docs/architecture/ARCHITECTURE.md` (metering is absent from it today).

**Governance / state** — `docs/adr/0060-*.md` (new) + `docs/adr/README.md`; a note on ADR-0056;
`.harness/state/{effects,feature_list}.json`, `progress.md`, `.harness/memory/`.

---

## Anticipated effects

- **NEW E-029 (usage metering contract)** — `UsageStore` + `UsageRecorder` + the bucket schema. Dependents:
  three adapters, the shared suite, the REST hook, the MCP recorder, the ingestion subscriber, the monthly
  guard, `/v1/usage`, the SDK, both views. Minted rather than folded into E-019 because it is a port with its
  own adapters and conformance suite — the effect-link protocol's own trigger. Its rationale must record the
  **no-`principal_id`** rule, since a future feature adding one would silently pull the store into DSR scope.
- **E-019 (billing contract)** — two rewrites: the `SubscriptionStore` seam note becomes three adapters behind
  a shared suite; the F-035 note is **closed for monthly compiles** while `maxSeats` must be **re-stated** as a
  remaining seam, not quietly dropped.
- **E-013 (compiler/entitlement)** — record that the metered predicate moved from "a provider object is
  present" to an explicit flag, and that this **realizes** ADR-0056 §3's stated-but-unimplemented consequence.
- **E-003 (REST/MCP contract)** — new `GET /v1/usage` (additive) ⇒ OpenAPI + SDK regenerated; compile gains a
  **429 path** (behaviour change, no shape change); **no MCP tool added** — record the refusal with its
  ADR-0053 reasoning so a future reader does not read it as an oversight.
- **E-004 (design tokens)** — two new views; single series → `--primary`, categorical → `--chart-*` (F-091).
- **E-014 (config + profile composition)** — `ProfileAdapters` gains two **required** members; `Runtime.usage`;
  `createRuntimeBilling` changes signature. **No config schema change** — record as deliberate.
- **E-015 (`instrumentServices`)** — **N/A structurally**; no `ApiServices` member is added. Record the
  reasoning, as F-061/F-062/F-063 did, so the absence reads as a decision.
- **E-026 (docs generated inputs)** — OpenAPI + fumadocs reference regenerate; `generated-drift.test.ts` is
  load-bearing in the `test` gate. `.env.example` unchanged.

---

## Test plan

**Red before green.** Before increment 6b, add the monthly-cap e2e against HEAD and capture its failure —
today a tenant compiles without limit forever, and that failure **is** the F-035 seam. Same for increment 10's
analytics spec. Captured output goes in `progress.md` and the commit message.

**Conformance — the heart of increments 1–3.**

| Adapter | Suite | Guard |
|---|---|---|
| in-memory UsageStore | `runUsageStoreConformance` (reference) | none — default `test` gate |
| SQLite UsageStore | the same suite, unmodified | none — default `test` gate |
| Postgres UsageStore | the same suite, unmodified | `TESSERA_TEST_POSTGRES=1` |
| in-memory / SQLite / Postgres SubscriptionStore | `runSubscriptionStoreConformance` | last one guarded |

**If a shared suite has to change to accommodate an adapter, that is a finding, not a task** (F-078).

**Regression — load-bearing.** The five existing `packages/config/tests/integration/*` files stay green and
**unedited**; any edit means the `ProfileAdapters` extension was not additive. `tests/e2e-full` and
`tests/bench` are re-run after **6a** specifically, because the effective compile budget on a Local runtime changes.

**Mutation discipline** is stated per increment. Where a mutation does **not** turn a test red, say so rather
than asserting the stronger claim (the F-056 lesson: three comments claimed more than their tests delivered).

**Both ways for guarded suites.** Run with Postgres up *and* down — an offline machine must stay green.

---

## Verification

```
node scripts/verify-state.mjs
pnpm -w typecheck && pnpm -w lint && pnpm -w format:check
pnpm -w test && pnpm -w build
pnpm -w test:e2e
pnpm -w test:e2e:full      # required by 6a
pnpm -w test:perf          # two new web routes
pnpm -w bench              # required by 6a
```

Targeted during the loop:

```
TESSERA_TEST_POSTGRES=1 pnpm --filter @tessera/billing test
TESSERA_TEST_POSTGRES=1 TESSERA_TEST_SELF_HOSTED=1 pnpm --filter @tessera/config test
pnpm --filter @tessera/sdk generate && pnpm --filter @tessera/docs generate
pnpm --filter @tessera/docs test
pnpm --filter @tessera/web test:e2e
```

**Evidence for `progress.md`:** per-gate pass counts; the captured **red-before** for the monthly-cap e2e and
the analytics spec; the **guarded** conformance counts with guards on (the number proving the Postgres
adapters ran rather than skipped); the mutation results named per increment; screenshots across 4 themes ×
light/dark.

---

## Risks

- **The metering hook runs on every metered `/v1` response** — one upsert per request on a hot search path.
  Mitigation available and **not built speculatively**: an in-process coalescing buffer. Measure first;
  `bench` has a search p95 threshold that will notice.
- **Fail-open is a deliberate cost leak** (§6). A tenant can exceed its entitlement during a store outage. The
  alternative turns a metering outage into a product outage. Recorded, not hidden.
- **`packages/billing` gains `drizzle-orm`, and `apps/mcp` imports it as a value.** `@tessera/retrieval` already
  puts drizzle in the MCP graph and the PG adapters take a `NodePgDatabase` handle without importing `pg` — but
  **verify against the built MCP graph** rather than assuming; the F-050/F-055 subpath arguments exist because
  this assumption has been wrong before.
- **UTC days diverge from the Overview chart**, which is viewer-local (F-088). Pre-aggregation makes the choice
  at write time, and an hour bucket cannot be split for +05:30/+05:45 offsets — one of which is the project
  lead's. Mitigated by **labelling**, not by hiding. Both options are in the ADR; neither is free.
- **Two nav sources** — editing one ships a page reachable from the sidebar but invisible to ⌘K. A test that the
  two lists agree retires this trap permanently.
- **Screenshots are the only check on the two new views' visual quality.** The contrast gate is executable;
  layout and hierarchy are not. Budget a `design-review` pass and expect it to find something no test did — it
  has every time.
