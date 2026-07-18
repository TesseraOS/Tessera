# Plan: F-087 Sources — scan state that resolves without a refresh, progress on the card

- **Feature:** F-087 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-38, FR-46, FR-62, FR-49
- **Service / package:** apps/web
- **Author:** Claude (Fable 5) · **Date:** 2026-07-18

## Intent

User items 1 + 2 (2026-07-18 report): *"even though a source scan is complete, we are showing
scanning state — gets fixed on refresh"*, and *"show the progress bar on the whole card at bottom,
not on a small portion"*.

## Root cause (item 1) — two sources of truth, ORed, and the stale one wins

`SourceRow` derives `running` as:

```
Boolean(progress?.running) || scan.isPending || status?.state === 'running'
```

`progress` is the live SSE truth; `status` is a **one-shot snapshot** from `useScanStatus`
(`staleTime: 5s`, no polling, `refetchOnWindowFocus: false` globally). Load the page mid-scan and
the snapshot says `running`. When `source.scan.completed` arrives, the reducer flips
`progress.running` to `false` — but the OR keeps the row scanning because the *snapshot* still says
`running`, and **nothing ever invalidates it**. Only a refresh refetches. The bug is precedence +
missing invalidation, not a missing rebuild.

## Fix (three small, layered mechanisms)

1. **Precedence:** live stream truth outranks the snapshot. Extract a pure
   `deriveScanView({ progress, status, mutationPending })` → `{ running, processed, total, summary,
   at, hasError, errorText }`: when `progress` exists for the source, *it* decides `running`; the
   snapshot only fills in when no live event has been seen this session. Unit-test the stale-snapshot
   case directly (completed event + cached `running` snapshot ⇒ not running).
2. **Event-driven invalidation:** on `source.scan.completed` / `source.scan.failed`, invalidate
   `['scan-status', id]` + `['sources']` so the snapshot catches up to reality for the next mount.
3. **Polling fallback:** `useScanStatus` gets `refetchInterval` = 5s **only while**
   `data.state === 'running'`, else off. With the stream down (sleep/laptop/proxy), the row still
   resolves; when the stream is healthy this costs one confirming refetch.

## Design (item 2) — the card carries its own progress

The determinate bar (F-081 made `total` real) moves from a `max-w-56` sliver in the status line to a
**full-width rail on the card's bottom edge** — the card itself reads as the unit of work:

- Card gains `relative overflow-hidden`; the rail is `absolute inset-x-0 bottom-0 h-1`, primary fill
  over a `bg-primary/15` track, `transition-[width]`.
- **Unknown total stays honest**: while the diff runs there is no fraction, so the rail shows an
  indeterminate sweep (CSS keyframes, `motion-safe:` only; `motion-reduce` falls back to a static
  soft fill) rather than a fake percentage.
- The status line keeps `processed / total` + gains the percent; a11y `role="progressbar"` moves
  with the rail (aria-valuenow only when determinate).
- Tokens only, all themes; no new colors. Restraint: no card glow, no gradient theatre.

## Verification

- New unit tests for `deriveScanView` (precedence, stale-snapshot, error, summary passthrough).
- `sources-view.test.tsx` updated: completed event flips the row out of scanning with a cached
  `running` snapshot in place.
- Web gates: typecheck, lint, format, test, build; sources e2e; axe sweep stays green.

## Effects

- Consumes `lib/api/events` scan reducer (unchanged) — E-003 untouched (no API change).
