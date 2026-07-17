# ADR-0053: The Overview leads with state — retiring the greeting hero, and charting activity only as far back as the trail can prove

- **Status:** Accepted
- **Date:** 2026-07-17
- **Deciders:** maintainer (dev-AshishRanjan), Claude Opus 4.8 (F-080)
- **Tags:** frontend, design, web, api, honesty
- **Supersedes (in part):** [ADR-0047](0047-dashboard-multi-theme-illustration-layer-contrast-gate.md) — **only** the two line-items that place art on the Overview's first screen: the *"overview hero band"* entry in the illustration usage budget, and the *"overview onboarding (greeting)"* mascot placement. ADR-0047's four-theme system, radial propagation, art idiom, honesty rules, and the contrast gate are **not** in dispute and stand unchanged.

## Context

The 2026-07-17 maintainer review of the dashboard: the Overview's top card *"is static and doesn't
suit a dashboard. It's very unprofessional."*

ADR-0047 put it there deliberately, so removing it is an ADR and not a delete (golden rule 7). The
band it sanctioned is real: `Dashboard`'s `HeroBand` — a theme-tinted gradient surface holding a
`Sparkles` "Context & Memory OS" badge, the headline *"Give your agents the right context, every
time"*, a paragraph of product prose, two CTAs, and the `Constellation` art.

Forces, verified against the tree rather than assumed:

- **It is marketing copy behind a login.** The band explains what Tessera *is* to a user who has
  already signed in — who, by construction, converted. It occupies the full first screen of the one
  page whose job is to answer "what is the state of my workspace?", pushing the stat cards — the
  actual answer — below it.
- **ADR-0047's justification was onboarding**, and onboarding is *conditional*: it is valuable
  before there is data and noise after. The band was **unconditional**. Meanwhile the "Get started"
  card — which carries the same onboarding value, concretely — was *also* unconditional, so an
  established workspace rendered onboarding twice and state once.
- **The greeting mascot placement was never built.** `mood="greeting"` appears nowhere in
  `apps/web`. Retiring the placement removes an unrealized intent, not a shipped surface.
- **Nothing is orphaned.** `Constellation` keeps three live placements (`/signin`, the graph empty
  state, and — under this ADR — the onboarding card), so the art layer survives intact. This is the
  budget being *narrowed*, not the illustration layer being walked back.
- **The maintainer also asked for an activity-over-time chart** ("only when we have data"), which
  collides with a documented decision. `apps/api/src/schemas/stats.ts` refuses trend fields, in its
  own words, because *"deriving one from `createdAt` would silently lie in any deployment using
  retention (FR-15), which deletes"* — and the audit trail **is** pruned (`AuditLog.prune` +
  `config.audit.retention`, since F-027). A naive "last 30 days" histogram would draw **zeros for
  pruned days**, and a zero that means "we deleted the record" is indistinguishable from one that
  means "nothing happened". That is precisely the lie the stats schema declines to tell.

## Decision

### 1. The Overview leads with state; the hero band is removed

`HeroBand` is deleted. The Overview opens on the stat cards. The illustration usage budget
(DESIGN-SYSTEM §11) drops "the overview hero band"; `onboarding/first-run` **stays**, which is where
the Overview's art now lives — inside the onboarding card, conditionally.

### 2. Onboarding is gated on real, persisted state — never on the session feed

The "Get started" card renders only while the workspace is genuinely empty, gated on `GET /v1/stats`
(`sources === 0 && documents === 0`).

It is **not** gated on the activity feed, which was the intuitive reading of "hide it once there's
activity" and is wrong: the feed is session-only *by design* (`lib/store/notifications.ts`: "a
reload starts empty"; F-065 is what persists it). Gating on it would re-show onboarding after every
refresh to a workspace with sources connected — telling an established user to go connect a source.
`/v1/stats` is persisted and tenant-scoped, and is already what the stat cards read.

### 3. The activity chart is audit-derived, and starts no earlier than the trail can prove

A new `GET /v1/stats/activity` server-aggregates the audit trail into **daily buckets** by action
group. The audit trail is the only real, persisted, tenant-scoped time series the system has: the
graph has no per-node `createdAt`, and the ingestion manifest holds only `path → contentHash`.

The honesty rule, and the point of this clause:

> **The series never starts earlier than the oldest event the trail actually holds.**

The server resolves the window's start as `max(requestedStart, oldestRetainedEventAt)` and **returns
the `from` it actually used**, so the client labels the real window rather than the requested one.

This is derived **from the data, not from config**, which is what makes it robust: it is correct
under `maxAgeDays` pruning, under `maxEntries` pruning (which no time-based clamp could handle), for
a workspace that is three days old, and under any future pruning policy — without reading
`config.audit.retention` at all. A young workspace shows three honest days instead of twenty-seven
fabricated zeros.

The chart renders **only when there is data**, consistent with §0's no-fabricated-data rule.

**This is not FR-47.** Analytics/metering (F-057) is per-tenant usage metering for billing. This is
a histogram of actions the trail already records. It adds **no** trend/delta field to `/v1/stats` —
that refusal stands, for the reason the schema gives.

## Consequences

- The Overview's first screen becomes state. Onboarding appears exactly once, exactly when useful.
- DESIGN-SYSTEM §11's usage budget and §0's illustration line are edited to match; `logo.tsx`'s
  reference in §0 is untouched here (that is F-083).
- `GET /v1/stats/activity` is a new REST contract ⇒ OpenAPI + SDK + dashboard (E-003). It is
  **dashboard-facing and deliberately has no MCP tool**: an agent has no use for a chart histogram,
  and ADR-0036 parity exists to keep *agent-relevant* capability at both surfaces, not to mirror
  every route. `get_stats` remains the agent's summary.
- The chart's honesty depends on the returned `from` being rendered, not the requested window. A
  client that ignores it re-introduces the lie — hence it is asserted in test.
- Charting reads (`*.read`) would drown the signal in page views, so the series covers **work**:
  ingestion/sources, memory writes, compiles, and searches.

## Alternatives considered

- **Keep the hero, make it dynamic** (greet by name, show live numbers). Rejected: it becomes a
  second, worse stat-card row — the cards already answer it, and the band's cost is the screen it
  occupies, not its stillness.
- **Chart from the session feed.** Rejected: session-only and capped at `FEED_LIMIT = 50`, so the
  line would reset to zero on reload. Fabrication with extra steps.
- **Clamp the window from `config.audit.retention.maxAgeDays`.** Rejected: it cannot see
  `maxEntries` pruning, and couples the API to a config field it does not need. Asking the trail for
  its oldest event is strictly more truthful and simpler.
- **Defer the chart to F-057.** Rejected: F-057 is billing metering. The trail already holds the
  data; the only real risk was the retention lie, and clause 3 closes it.
