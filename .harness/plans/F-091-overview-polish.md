# Plan: F-091 Overview polish — activity narratives, notification loading/alignment, theme-true chart

- **Feature:** F-091 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-38, FR-49, NFR-14
- **Service / package:** apps/web
- **Author:** Claude (Fable 5) · **Date:** 2026-07-18

## Intent

Five user items (2026-07-18, second batch), all on the Overview/notifications surfaces:

1. Notification rows: icon and message misaligned.
2. Recent activity too terse ("Source scan started", "Context compiled") — add meaningful,
   professional subtext.
3. Notification messages too generic — short, relevant, usable.
4. No loading state in the notifications panel.
5. Activity chart: colors not theme-true; endpoints clipped; make the section enterprise-grade.

## What the audit found (live app + code, before-screenshots taken)

- **Items 2+3 share one root**: `describeEvent` returns only a title (+ optional id detail).
  The API rows carry `action`/`target`/`actor`/`at` and deliberately no content (NFR-7), so the
  subtext must be **derived from action semantics** — what the event means for the workspace —
  not from payloads we don't have. One map, two surfaces (feed + bell).
- **Item 1**: bell rows use `items-start` with a 24px icon chip beside a single 16px text line —
  the title's center sits ~6px above the chip's. Once every row has a description (item 3), rows
  are a deterministic two-line block; centering the chip against it fixes alignment for good.
- **Item 4**: `NotificationsMenu` destructures only `data` — while the query is pending the panel
  shows nothing (and the empty state's copy is one refetch away from lying). The feed already has
  the skeleton pattern; the bell needs its own (plus an honest error + retry).
- **Item 5, colors**: dark-mode `--chart-1` is stock shadcn blue `#1447e6` on a theme documented
  as "MONOCHROME chart ramp" (globals.css header). But `--chart-1..5` is the **categorical**
  palette — KIND_ACCENT (graph legend, F-090), signal badges, memory kinds, and the art layer all
  depend on distinguishable hues — so retuning the ramp would break real consumers. The surgical
  fix: the Activity chart is a **single-series trend** and rides `var(--primary)` instead —
  monochrome white/black in Monkai (the documented intent), each theme's own accent in
  Amber/Claude/Notebook. Zero collateral.
- **Item 5, clipping**: `margin={{ top: 4 }}` leaves 0 left/right/bottom — half the 2px stroke
  (and the hover dot) is clipped at the window edges.

## The changes

- `components/activity-feed.tsx` — `describeEvent` gains a mandatory `description` (short,
  factual, per action×target; honest generic line for the unknown-action fallback). Feed rows
  render title + description; the id detail moves inline beside the title (mono, muted) so rows
  stay two lines. Rows center the chip against the block.
- `components/app-header.tsx` — bell rows: same two-line structure, `items-center`; pending →
  3 skeleton rows; error → one-line status + Retry (`refetch`). Titles, `— mark as read` labels,
  and testids unchanged (e2e pins them).
- `components/activity-chart.tsx` — series color `var(--primary)`; margins cover stroke + themed
  `activeDot` (fill `--primary`, stroke `--sidebar` = card ground); header gains the window total
  (`N actions`), description stays honest about the floored window; axis-free stays (F-088).
- `app/globals.css` — header comment corrected: the monochrome ramp intent is carried by
  single-series charts riding `--primary`; `--chart-1..5` documented as the categorical palette.

## Anticipated effects

- `describeEvent` consumers: feed + bell only (grep-verified). Return type widened additively.
- E2E `home.spec.ts` pins titles/labels/testids — all preserved. Unit tests extended, not rewritten.
- `--chart-*` untouched ⇒ KIND_ACCENT / badges / art / contrast gate unaffected.

## Test plan

- Unit: `describeEvent` description present for every mapped action and the fallback; bell
  loading/error states; feed renders description subtext.
- E2E: existing home spec must stay green (titles, read marks, axe sweeps).
- Visual: after-screenshots dark + light, bell open/loading, chart hover.

## Verification

`pnpm --filter @tessera/web` typecheck/lint/test + repo format + build (gates.json), evidence in
progress.md. Screenshots via the preview browser.

## Risks / open questions

- Description copy is load-bearing UX, not filler — kept ≤ ~60 chars so the 320px popover never
  wraps ugly. No OQ requiring an ADR: no contract, token, or dependency changes.
