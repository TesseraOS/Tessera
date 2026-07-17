# Plan: F-084 Overview activity chart — a store-level audit aggregation that cannot render a pruned day as silence

- **Feature:** F-084 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-38, FR-49, FR-55
- **Service / package:** `@tessera/api` (port + aggregation) → `@tessera/config` (SQLite adapter) → SDK → `apps/web`
- **Author:** Claude (Opus 4.8) · **Date:** 2026-07-17
- **Decision record:** [ADR-0053](../../docs/adr/0053-overview-leads-with-state-not-a-greeting-band.md) clause 3

## Intent

User item 5, split from F-080: *"show some activity graph wrt time … only when we have data"*, below
the stat cards. The decision is already in ADR-0053 clause 3; this implements it.

Done means: the Overview shows a daily activity chart backed by **real persisted history**, it starts
no earlier than the trail can prove, and it renders only when there is data.

## The trap this feature exists around (do not build the naive version)

`apps/api/src/schemas/stats.ts` refuses trend fields, *in its own words*, because "deriving one from
`createdAt` would silently lie in any deployment using retention (FR-15), which deletes" — and the
audit trail **is** pruned (`AuditLog.prune` + `config.audit.retention`, since F-027). A naive "last 30
days" histogram draws **zeros for pruned days**, and a zero that means "we deleted the record" is
indistinguishable from "nothing happened".

ADR-0053 closes it: **the series never starts earlier than the oldest event the trail actually
holds**, derived from the *data* (not from `config.audit.retention`). That is the only form that
survives `maxEntries` pruning — which no time-based clamp can see — and it is simpler than reading
config besides.

## Approach — aggregate at the store, window honestly above it

### 1. Port method (the data layer)

Add `activity(query)` to the `AuditLog` port. It aggregates **at the store** — one SQL `GROUP BY`,
never paging the window into memory to count it (the same thing F-080 refused to let the *client* do).

```
activity(query: { since, until, actions? }): Promise<{
  buckets: { date: 'YYYY-MM-DD'; count }[];   // days with ≥1 matching event, ascending
  earliest: string | null;                    // MIN(at) over the tenant's WHOLE trail — the retention floor
}>
```

- SQLite: `GROUP BY substr(at,1,10)` (the `at` column is ISO text, so the first 10 chars are the UTC
  date) with `action IN (…)` + the window; `earliest` is `SELECT MIN(at) … WHERE tenant_id = ?` over
  **all** rows (any action) — that is how far back the trail remembers, and the retention floor
  regardless of *why* rows were pruned.
- In-memory: the same contract, computed in JS.
- **Covered by the shared conformance suite** — so both adapters are proven to agree. This is the
  F-078 lesson: a port contract only the reference adapter honours is not a contract. Do **not**
  duplicate assertions into one adapter's own test.

### 2. The "work" action set

Exclude the passive `*.read` page-view actions (`memory.read`, `effects.read`, `source.read`,
`audit.read`, `billing.read`, `token.read`, `retention.read`); keep everything else — `search`,
`compile`, `*.write`, `*.manage`, `*.export`, `dsr.delete`. Export it as `ACTIVITY_ACTIONS =
AUDIT_ACTIONS.filter(a => !a.endsWith('.read'))` — a mechanical, defensible rule, matching the user's
"ingestion/sources, memory writes, compiles, searches, not page views".

### 3. Aggregation helper (Fastify-free, like `computeWorkspaceStats`)

`computeActivity(services, tenantId, { days })`:
- resolve the window `[since, until]` (default: last N days, `until` = today UTC);
- call the port; compute `from = earliest === null ? since : max(since, earliest)` — **the honest
  start**;
- **zero-fill** the calendar days in `[from, until]` (pure date math — filling a gap with a real 0 is
  not fabrication; it is a day inside the retained window that genuinely had no work). Days *before*
  `from` are never emitted.
- return `{ from, until, points: { date, count }[] }`.

### 4. REST + web

- `GET /v1/stats/activity?days=` → `{ from, until, points }`. **Dashboard-facing, no MCP tool**
  (ADR-0053: an agent has no use for a histogram; `get_stats` stays the agent's summary).
- SDK regenerates (rebuild `@tessera/api` **first** — F-081's trap: `generate.mjs` imports the built
  package).
- Web: `useActivity()` hook + an `ActivityChart` using the **existing `ui/chart.tsx`** (shadcn/
  Recharts — this is its first consumer, so the `--chart-*` token wiring must be *proven*, not
  assumed) placed **below the stat cards** on the Overview, rendered only when `points` has a nonzero
  total. It labels the window from the returned `from`, never the requested one.

## Files to touch

- `apps/api/src/audit/{model.ts,port.ts,audit-log.conformance.ts}`, `apps/api/src/audit/in-memory.ts`,
  `apps/api/src/stats/activity.ts` (new, Fastify-free), `apps/api/src/schemas/stats.ts`,
  `apps/api/src/routes/v1/stats.ts`, `apps/api/src/index.ts` (exports).
- `packages/config/src/audit/sqlite-audit-log.ts` + its test.
- `packages/sdk` (regen).
- `apps/web/lib/api/{client,hooks,types}.ts`, `apps/web/components/{dashboard,activity-chart}.tsx`.

## Anticipated effects

- **E-020 (audit)** — the `AuditLog` port grows a method; both adapters + the conformance suite move
  together. This is the exact shape F-078 flagged; honour it (shared suite, no duplication).
- **E-003 (REST/MCP contract)** — a new `GET /v1/stats/activity` ⇒ OpenAPI + SDK + dashboard. **No
  MCP tool**, deliberately; `/v1/stats` itself is unchanged (its no-trend-field refusal stands).
- **E-004 (DESIGN-SYSTEM)** — first real use of the chart tokens; verify they resolve in all 4 themes
  × 2 modes rather than assume.

## Test plan

- **Conformance (both adapters):** buckets group by UTC day and count only matching actions; `*.read`
  excluded; `earliest` is the min over the whole trail; empty trail → `earliest: null`, no buckets.
- **Aggregation helper (unit):** `from` = `max(since, earliest)`; a trail whose oldest event is 3
  days old inside a 30-day request starts at day -3, not day -30 (**the anti-lie test**); zero-fill is
  contiguous and never emits a day before `from`.
- **API:** the route returns the `from` it used; `days` validated/clamped.
- **Web:** the chart hides when total is 0; it labels the returned `from`; renders in all themes.

## Verification

Gates: `state`, `typecheck`, `lint`, `format`, `test`, `build`, plus `home.spec.ts` (the Overview
route) and a screenshot of the chart with data.

## Risks / open questions

- **UTC day bucketing** is a real choice: a user near a day boundary in another timezone sees an event
  land on the "wrong" day. UTC is the honest default (the `at` values are UTC, the retention math is
  UTC) and keeps server + store agreeing; a per-user tz is out of scope. State it in the axis/tooltip
  rather than pretend local time.
- **Zero-fill vs sparse:** filling within `[from, until]` is correct (those days are inside the
  retained window). Filling *before* `from` is the lie; the helper must never do it — pinned by test.
- **Landing size:** two increments — data layer (port + adapters + conformance, green on its own),
  then API + SDK + web — mirroring F-081, so each is verifiable.
