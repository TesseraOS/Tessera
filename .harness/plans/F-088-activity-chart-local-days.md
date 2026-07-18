# Plan: F-088 Overview activity chart — local-time days, axis-free

- **Feature:** F-088 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-38, FR-49, FR-55
- **Service / package:** apps/api (+ @tessera/config adapter, @tessera/sdk, apps/web)
- **Author:** Claude (Fable 5) · **Date:** 2026-07-18

## Intent

User items 3 + 10 (2026-07-18 report): *"the activity chart should not show any axis"* and *"why is
the activity chart dealing in UTC — shouldn't we deal in the user's local timezone?"*.

## Item 10 — the day boundary belongs to the viewer

F-084 buckets by UTC day (`GROUP BY substr(at,1,10)`) and labels it honestly. But honesty about the
wrong unit is still the wrong unit: for a user at UTC+5:30, evening work lands on *tomorrow's* bar.
A calendar day is a viewer-relative concept, so the viewer's offset must reach the aggregation —
the store, because F-080/F-084 refused to page the trail into memory to count, and re-bucketing
client-side would need the raw events.

**Contract:** `GET /v1/stats/activity` gains `tzOffset` — minutes **east** of UTC (JS:
`-new Date().getTimezoneOffset()`), integer, validated to ±840, default 0 (exact F-084 behavior, so
existing callers are untouched).

- **Port:** `ActivityQuery` gains `tzOffsetMinutes?` (default 0). Buckets become *local* calendar
  days; `earliest` stays an instant (unchanged).
- **SQLite:** `date(at, '<n> minutes')` — SQLite parses the ISO `Z` form and `date()` returns
  `YYYY-MM-DD`; the shift stays inside the `GROUP BY`, still aggregated at the store.
- **In-memory:** day = `toISOString` of `at + offset`, sliced — same rule, provably (conformance).
- **`computeWorkspaceActivity`:** the window is *local* days: `until` = local day of now, requested
  `from` = 29 local days back; the query bounds sent to the store are the UTC instants of those local
  midnights. The **pruning floor survives**: clamp compares the *local* day of `earliest` (ADR-0053
  clause 3 — a pruned local day is never drawn as silence).
- **Fixed-offset semantics, stated:** the offset is the client's *current* offset applied to the
  whole window. Across a DST transition inside the window, boundary hours can land one bar off. The
  alternative (IANA tz in SQL) has no tz database in SQLite; the caveat is documented in the schema
  description rather than silently wrong.
- Shared conformance covers both adapters (+ focused SQLite tests, F-063 precedent — F-078 still
  owns running the shared suite across the package boundary). OpenAPI + SDK regenerated in-change
  (build api first — the generator imports the built app).

## Item 3 — no axes

The chart keeps its data honesty and loses its chrome: `XAxis` stays mounted but `hide` (it anchors
the tooltip's label), `YAxis` and `CartesianGrid` are removed, margins collapse. The window label
lives where it already does — the card description ("since {from}") — now formatted as a local date
without the `(UTC)` tag. Tooltip continues to carry exact per-day values, so removing the y-scale
loses no information a hover can't recover.

## Verification

- `stats/activity.test.ts`: offset cases (evening UTC event lands on the next local day at +330;
  negative offsets; floor clamp under offset; default 0 unchanged).
- Conformance + focused SQLite tests for local-day bucketing.
- Chart tests updated (no axes rendered; local label). api + web gates green.

## Effects

- E-003 (REST contract: additive query param), E-020 (audit port + both adapters + conformance).
