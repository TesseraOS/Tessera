# ADR-0060: Usage metering lives beside the entitlements it enforces, latency is measured at the boundary, and "metered" becomes an explicit flag

- **Status:** Accepted
- **Date:** 2026-07-27
- **Deciders:** Project lead (explicit, on §1 and §3) + implementing agent
- **Tags:** billing, entitlements, analytics, storage, api, mcp, web, privacy
- **Relates to:** [ADR-0056](0056-entitlement-clamp-silent-and-metered-only.md) (superseded in part — §1),
  [ADR-0011](0011-billing-dodo-payments.md), [ADR-0031](0031-billing-port-and-open-core.md),
  [ADR-0053](0053-overview-leads-with-state-not-a-greeting-band.md) (window honesty),
  [ADR-0059](0059-self-hosted-profile-and-deployment-artifacts.md) (the both-profiles rule)

## Context

F-057 must meter per-tenant usage (NFR-12), enforce the monthly-compile entitlement (closing the F-035
seam), persist subscriptions (closing the F-030 seam), and render FR-47's analytics. Building it forces
four questions the acceptance criteria assume are already answered, and they are not.

### 1. A decision that was made and never implemented

[ADR-0056 §3](0056-entitlement-clamp-silent-and-metered-only.md) decided: *"a deployment that wired a
`BillingProvider` is metered and is clamped; one that wired none is self-hosted and is not"*, and listed
as a Positive: *"Self-hosted users stop being capped at a cloud tier's limit."*

The composition root does not implement it. Traced end to end:

| step | file | effect |
|---|---|---|
| `provider: 'none'` still returns an adapter | `packages/config/src/profiles/assemble.ts:151` | `createLocalBilling()` |
| that adapter reports every tenant free | `packages/billing/src/adapters/local.ts:14` | `freeSubscription(tenantId)` |
| the free plan caps a compile | `packages/billing/src/domain.ts:38` | `maxTokensPerCompile: 8000` |
| the clamp treats any defined provider as metered | `packages/billing/src/budget.ts:32` | clamps |

So **every runtime-composed Local and self-hosted deployment is capped at 8000 tokens per compile today**,
which is exactly what ADR-0056 says must not happen, and the Inspector's own 32000 preset
(`apps/web/components/inspector/compile-form.tsx:16`) is being silently reduced. `createCompileBudgetClamp`
is not at fault — its `undefined` pass-through is correct. The predicate is: *"is an object present"*, and
the composition root always makes one present.

This matters for F-057 specifically, and not academically: `maxMonthlyCompiles` on the free plan is **200**.
Enforcing it under the same predicate would hard-block every local and self-hosted deployment after 200
compiles in a calendar month. That is the F-056 lesson ("a shortcut that caps a deployment profile") applied
to every profile at once.

### 2. The acceptance names a capability that does not exist

Clause 3 says analytics latency comes *"from the observability metrics"*. There are no readable metrics:
`createInstruments` builds histograms on the global meter, which is *"a no-op until a meter provider is
registered"* (`packages/observability/src/metrics.ts:6-9`); `startTelemetry`'s `metricReader` defaults to
none (`telemetry.ts:19-20`); and neither shipped bin passes one (`apps/server/src/bin/api.ts:11`,
`bin/mcp.ts:14`). Nothing is exported, nothing is scraped, and there is no per-tenant dimension anywhere.
The dashboard cannot read a latency it can only write.

### 3. Usage is close to personal data, and one column decides which

An aggregate per-tenant counter is billing evidence. The same table with a `principal_id` column is personal
data subject to NFR-13 DSR **export and erasure** — and honouring an erasure would destroy the invoice basis.
The column is a one-line decision with a compliance-shaped consequence, so it is decided here rather than
discovered later.

## Decision

### §1 ⚑ "Metered" becomes an explicit flag, not an object-presence test

`createRuntimeBilling` yields `metered = config.billing.provider !== 'none'`, and **both** the existing token
clamp and the new monthly guard read that flag:

```ts
createCompileBudgetClamp({ billing, metered })   // metered === false ⇒ pass-through
createMonthlyCompileGuard({ billing, usage, metered })
```

Consequences, stated plainly:

- **This fixes shipped behaviour.** A Local or self-hosted deployment stops being capped at 8000 tokens. That
  is what ADR-0056 §3 decided and its Positive bullet promised; this ADR supersedes ADR-0056 only in *how*
  metering is detected, not in *what* it means.
- It gets **its own increment and its own commit**, so a regression bisects to the predicate change alone.
- `apps/api/tests/e2e/billing.e2e.test.ts` and `packages/billing/src/budget.test.ts` pin the old predicate and
  are **rewritten, not deleted** — they become "an explicitly metered deployment clamps" plus a new "an
  unmetered runtime-composed deployment does not". That second assertion never existed, which is why the bug
  survived a full feature's review.
- `tests/e2e-full` and `tests/bench` are re-run, because a runtime that stops clamping changes `pkg.budget`
  for any caller asking for more.

**Rejected:** enforcing wherever `services.billing` is defined (blocks every local and self-hosted deployment
at 200 compiles/month and ships the 8000 bug onward); and gating only the *new* guard on `provider !== 'none'`
while leaving the clamp alone (two definitions of "metered" in one package — the F-060/F-061 drift pattern).

### §2 The usage contract lives in `@tessera/billing`

Beside the entitlements it exists to serve. The package depends on `@tessera/core` only, which is what lets
`apps/mcp` import it as a value without violating the F-012 no-Fastify invariant; it gains `@tessera/storage`
+ `drizzle-orm`, the dependency set `@tessera/memory` already carries. The Postgres adapters take a
`NodePgDatabase` handle and import no `pg`, so no export-subpath gymnastics are needed (that was only for
S3/BullMQ, which drag real new dependencies).

**Rejected:** a `@tessera/usage` package — usage exists to serve entitlements, and splitting them puts the
counter and the limit in two packages that must agree; and `@tessera/api` — it would make the MCP surface
import a Fastify package.

### §3 ⚑ Latency is measured at the metering boundary and reported as average + slowest, never p95

Duration is recorded alongside the count, from `reply.elapsedTime` (REST) and a timer pair (MCP). The store
holds `count`, `sumDurationMs`, `maxDurationMs` per bucket. This is also the only tenant-scoped form
available: an OTel tenant attribute would be a cardinality bomb and would require a cross-tenant read through
a scrape endpoint.

**A sum and a max cannot produce a percentile.** The Analytics view therefore labels them **"average"** and
**"slowest"**. Labelling a mean as p95 would be the exact fabrication DESIGN-SYSTEM §0 forbids. True
percentiles remain where they already are and are already gated: `tests/bench` measures search p95 < 300 ms
and compile p95 < 2 s against NFR-4. The dashboard is not that instrument. If a real p95 is ever required in
the product, the follow-up is a small fixed-bucket histogram (≈8 log-scale columns) — named here, not built.

This adds **no** meter provider, **no** exporter, **no** scrape endpoint, and **no** tenant attribute. The
OTel histograms stay exactly as they are; wiring them remains observability's own recorded seam (E-015).

### §4 Schema: UTC day buckets, typed columns, and deliberately no principal

```
usage_buckets(
  tenant_id, project_id, day,            -- 'YYYY-MM-DD', UTC
  operation,                             -- 'compile' | 'search' | 'ingest' | 'memory.write'
  count, sum_tokens,
  sum_duration_ms, max_duration_ms,
  sum_budget_adherence, sum_provenance_coverage,   -- compile only
  PRIMARY KEY (tenant_id, project_id, day, operation)
)
```

- **Typed columns, not a generic `(metric, value)` table.** The metric set is small, closed, and enumerated in
  the acceptance. A generic key/value metrics table *is* a metrics system, and §3 says we are not building one.
- **No `principal_id`.** Without it the table is a pure aggregate: not in the DSR bundle, not deleted by
  `POST /v1/dsr/delete`, consistent with the audit trail's retained-by-design posture — and "who did this" is
  already answered by the audit trail. **A future feature that adds this column silently pulls the store into
  DSR scope**; that is recorded on effect E-029 so it cannot happen by accident.
- **`project_id` is recorded** so Analytics can scope to a project like every other view, while the monthly
  entitlement sums **across** projects — a subscription is per-tenant.
- **UTC days, labelled UTC on the page.** The alternative — hourly buckets rolled into the viewer's offset,
  mirroring F-088's Overview chart — cannot serve +05:30 or +05:45, because an hour bucket cannot be split, and
  pre-aggregation makes the choice at write time where it cannot be undone at read time. The cost, accepted: two
  charts in one product with different day boundaries. Mitigated by saying so on the page, not by hiding it.
- **Bounded growth:** `tenants × projects × 4 operations × days` ≈ 1,460 rows per project-year. No pruning —
  usage is billing evidence.
- **Aggregation happens at the store** (`SUM`/`GROUP BY`), never by paging rows into the API (the ADR-0053 rule),
  which is why `summary()` is a first-class port method covered by the conformance suite.

### §5 One recorder per surface; handlers annotate, they never record

- **REST:** a single failure-isolated `onResponse` hook keyed on a per-route `config.meter` marker, registered
  once beside `recordAudit`. Handlers set `request.usageTokens` / `usageScores`; the hook reads them. Responses
  `>= 400` are not counted — a refused compile consumed nothing. **A metering failure must never fail a request.**
- **MCP:** a `usage` option applied inside the `runTool` wrapper, so metering works **with and without a
  gateway** — a stdio deployment without a gateway must still meter, or the agent surface is invisible.
  Recording in `McpGateway.guard` would miss ungated deployments and has no access to the result, so no tokens.
- **Ingestion:** one `document.ingested` subscriber beside the SSE bridge, using the event's own `scope`.
  `POST /v1/sources/:id/scan` returns 202 since F-081, so metering the request would count intent, not documents.
- **Never both.** One hook per surface is what makes "fed once, not twice" structural. A test asserts a single
  `/v1/compile` request produces exactly one row increment.

### §6 The monthly guard: one implementation, `RateLimitedError`, fail-open

Built once in `@tessera/billing` and consumed by `apps/api/src/routes/v1/compile.ts` and by
`apps/mcp/src/server.ts` for **both** `compile_context` and `explain` (`explain` calls `compiler.compile`, so it
spends the same resource). This is ADR-0056 §4's standing "one implementation, both surfaces" rule.

- Throws **`RateLimitedError`** → 429 with `details: { limit, used, resetAt }`, reusing the existing envelope: no
  new error code, no OpenAPI change, no SDK regeneration for the error path, and MCP's `toEnvelope` already
  surfaces it. A new `QUOTA_EXCEEDED`/402 would ripple the catalog through OpenAPI → SDK → the dashboard for a
  semantic nicety. Rejected.
- **Fail-open on store error.** If the usage store is unreachable, serve the compile — logged, never silent. A
  metering outage that becomes a total product outage is worse than a few uncounted compiles. This is a
  deliberate cost leak, recorded rather than hidden.
- Order: guard **before** clamp (refuse, then cap); record **after** success.

### §7 The persistent `SubscriptionStore` is required of both profiles

`ProfileAdapters` gains `subscriptionStore` and `usageStore` as **required** members, so the compiler asks Local
*and* self-hosted for both — the ADR-0059 mechanism, and why "SQLite only" cannot compile.
`createRuntimeBilling` takes the store instead of constructing one. The in-memory adapter stays as the reference
implementation that drives the new shared conformance suite — a suite the port has never had, which is the F-078
divergence pattern waiting to happen. `profile: local` + `billing.provider: dodo` is a legal config today and a
plausible open-core shape, so the SQLite adapter is not vestigial.

### §8 `GET /v1/usage` is admin-guarded, store-aggregated, and honest about its window

`admin:manage` (an existing permission — a new one would ripple `GET /v1/rbac` → OpenAPI → SDK → the token-scope
UI). Project-scoped via the existing selection header, except `entitlement`, which is tenant-wide. Registered
without a store ⇒ a clean 409, so `buildServer({})` still generates OpenAPI. Returns the `from` the server
**actually used**, so a window that predates the data is never drawn as zeros (ADR-0053 clause 3), and `null`
rather than `0` for quality averages over an empty window — a zero average is a lie about an empty set.

**Not audited** — an aggregate read on page load would flood the trail; same posture as `/v1/stats`.
**No MCP tool** — ADR-0053's rule: an agent has no use for a usage histogram, and `get_stats` already covers
workspace state. Recorded so the absence reads as a decision.

### §9 UI: provenance-first, honest empty states, no invented money

`/analytics` and `/billing`, both `admin:manage`. A single series rides `--primary` and categorical splits use
`--chart-1..5` (the F-091 rule already recorded on E-004). Cost posture names the embeddings provider (local ⇒ no
API spend, which is literally NFR-12's claim) and the plan price — **never a synthesized dollar figure**, because
no per-token price or provider bill exists in this system. On an unmetered deployment the Billing view says so
plainly instead of showing a dead upgrade button. The `Plan & usage` card on `/profile` stays and links here — it
is identity context, not the billing surface.

### §10 No configuration change

`billing.provider` already carries the metered signal (§1). No new config section and **no new `TESSERA_*` var**,
therefore no `.env.example` or `env-reference.json` churn. A `usage.enabled` switch was considered and rejected:
metering an operator can silently switch off is metering you cannot bill from.

## Consequences

**Positive.** The F-035 and F-030 seams both close. Local and self-hosted stop being capped at a cloud tier's
limits — the open-core promise ADR-0056 already made becomes true. The `SubscriptionStore` port gains the shared
conformance suite it never had, so three adapters cannot drift (F-078's failure mode, refused up front). FR-47's
analytics read real recorded facts, with every number the system cannot honestly produce named as absent rather
than fabricated.

**Negative, accepted.** A behaviour change to long-green code (§1), isolated to its own commit and re-verified
through `e2e-full` and `bench`. One upsert per metered request — mitigation (an in-process coalescing buffer)
identified but **not built speculatively**; `bench`'s search p95 threshold is the instrument that would demand it.
A deliberate cost leak while the usage store is down (§6). Two day-boundary definitions in one product (§4),
mitigated by labelling. And an analytics latency that is a mean and a max, not a percentile (§3) — stated on the
page in those words.

**Superseded in part:** ADR-0056 §3's *mechanism* (object presence → an explicit flag). Its *meaning* — self-hosted
is not "the free plan" — is unchanged and is finally implemented.
