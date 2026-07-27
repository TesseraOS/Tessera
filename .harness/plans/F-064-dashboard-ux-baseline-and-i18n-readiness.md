# Plan: F-064 Dashboard UX-baseline completion + i18n readiness

- **Feature:** F-064 (see [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-49 (UX baseline), NFR-14 (i18n readiness), NFR-9 (a11y)
- **Service / package:** `apps/web` (`@tessera/web`)
- **Author:** Claude (lead) · **Date:** 2026-07-27

## Intent

Close the FR-49 baseline honestly — several items were claimed and are not built — and make the
dashboard's strings translatable without translating them. "Done" for a user: long lists stay
responsive, a right-click on a data row does the obvious thing, `?` shows what the keyboard can do,
`⌘K` reaches every route *and* every primary action, and no English string is hardcoded in a
component any more.

## The audit, done first (acceptance clause 1)

Verified by reading the code, not by trusting the record:

| FR-49 item | Reality |
|---|---|
| Virtualized long lists | **Partial.** `memory-view` and `search-view` virtualize directly; `audit-view` gets it via the shared `ui/data-table`. **`timeline-view` renders `entries.map(...)` unvirtualized** — and the timeline merges memory + audit, so it is the list most likely to grow. |
| Optimistic updates (memory capture) | **Not implemented.** No `onMutate` anywhere in `apps/web`. |
| Context menus on data rows | **Not implemented.** There is no `ui/context-menu` component at all — only `dropdown-menu`. |
| Keyboard-shortcuts help overlay | **Not implemented.** No match for a shortcuts dialog anywhere. |
| `⌘K` palette covers every route + primary action | **Routes: yes** — it maps `navItems` from `lib/nav.ts`, so coverage is structural and already guarded by the nav-agreement test. **Primary actions: no** — the palette offers exactly one (`New project`) plus theme/mode. |
| i18n | **Not implemented.** No catalog, no dependency, no guard. |
| Screenshot matrix (light/dark × desktop/mobile) | **Not implemented** — and see the open question below, because a prior decision argues against it. |
| Reduced motion | **Implemented** — `@media (prefers-reduced-motion: reduce)` in `app/globals.css:288`. Needs an assertion, not an implementation. |
| axe WCAG AA per route | **Implemented** — all 14 e2e specs use `AxeBuilder`. Needs re-running, plus coverage for anything new. |

So four items are unbuilt, one is partial, two need assertions rather than code, and one is a
question for the lead.

## Open question for the lead — the screenshot-matrix clause

Clause 3 asks for "a screenshot matrix (light/dark × desktop/mobile) across all routes". F-057
already considered and rejected exactly this, in a comment that is still in the repo
(`apps/web/tests/e2e/analytics.spec.ts:84`): a screenshot "proves a page looked right on the day
someone looked at it", whereas a contrast assertion "fails the build" when it stops being true. That
feature shipped executable WCAG assertions across 4 themes × light/dark instead.

Adding a screenshot matrix now would either (a) be unasserted artifacts nobody diffs, or (b) be
pixel-diff snapshots, which are famously flaky across platforms and would need a baseline committed
from one machine. **Recommendation:** extend the *executable* matrix — assert theme and viewport
behaviour (layout does not overflow, the mobile nav appears, reduced-motion is respected) across
routes, and produce screenshots as CI artifacts for human review without gating on them. To be
confirmed before increment 8; it changes what that increment builds, not whether the rest proceeds.

## Approach

Reuse first: the shared `ui/data-table` (already virtualized) rather than per-view virtualization;
shadcn's `context-menu` primitive alongside the existing `dropdown-menu`; the existing `navItems`
registry so palette coverage stays structural; TanStack Query's `onMutate`/rollback for the
optimistic path; the existing 14 axe specs as the a11y baseline.

New: `lib/i18n/` — a flat, typed English catalog plus a `t()` accessor with no runtime dependency
(NFR-14 is *readiness*, not translation), and an ESLint rule that fails a new hardcoded user-facing
string in a component.

## Increments

| # | Increment | Proof |
|---|-----------|-------|
| 0 | Plan + claim (+ ADR if the screenshot decision deviates) | `verify-state` |
| 1 | Timeline through the virtualized `DataTable` (or its own virtualizer if the shape does not fit) | web unit + e2e; a long-list test asserting only a window renders |
| 2 | Optimistic memory capture with rollback on error | unit test: row appears before the promise resolves, and disappears on rejection |
| 3 | `ui/context-menu` + row actions (copy ref / open / show effects) on memory, search, audit, timeline | unit tests per surface + axe |
| 4 | Keyboard-shortcuts overlay (`?`), listing every registered binding | unit test + axe with it open |
| 5 | Palette: primary actions per route (capture memory, add source, compile, export audit …) | palette test asserting an action for every route that has one |
| 6 | `lib/i18n` catalog + `t()` + migrate the shell and 2 views | unit tests updated; no visible string change |
| 7 | Migrate the remaining views to the catalog | full web suite green |
| 8 | The lint guard (no hardcoded user-facing strings in components) | rule fires on a planted violation |
| 9 | Theme/viewport parity assertions + reduced-motion assertion; axe re-run across all routes | web e2e |
| 10 | Effects (E-004), progress, memory, status → done | full gates |

## Files to touch

- `apps/web/components/timeline/*`, `memory/*`, `search/*`, `audit/*` — virtualization + row actions.
- `apps/web/components/ui/context-menu.tsx` (new), `components/shortcuts-overlay.tsx` (new).
- `apps/web/components/command-palette.tsx` + `lib/nav.ts` — primary actions.
- `apps/web/lib/api/hooks.ts` — the optimistic mutation.
- `apps/web/lib/i18n/*` (new) + every view.
- `apps/web/eslint.config.mjs` — the guard.
- `apps/web/tests/e2e/*` — parity + a11y.

## Anticipated effects

- **E-004** (design tokens → components) — new primitives must use tokens, not raw colour.
- The i18n catalog becomes a **new shared contract**: every user-facing string flows through it, and
  the lint guard makes that structural. Likely a new effect id, recorded in increment 10.
- `lib/nav.ts` widens from routes to routes-plus-actions, which the palette and the nav-agreement
  test both read.

## Test plan

- **Unit:** virtualized window size; optimistic insert + rollback; context-menu actions invoke the
  right handler; shortcuts overlay lists every registered binding (derived, not duplicated); `t()`
  returns the catalog value and throws/flags a missing key.
- **E2E:** `?` opens the overlay and axe passes with it open; right-click a row and take an action;
  palette reaches a primary action; theme/viewport parity; axe across every route.
- **Lint:** the new rule fires on a planted hardcoded string and stays silent on legitimate ones
  (`className`, `data-testid`, aria roles).

## Verification

`node scripts/verify-state.mjs`, `pnpm -w typecheck`, `pnpm -w lint`, `pnpm -w format:check`,
`pnpm -w test`, `pnpm -w build`, `pnpm -w test:e2e` (includes axe), plus `pnpm -w test:perf` since
`apps/web` first-load JS is budgeted and new primitives add weight.

## Risks / open questions

1. **The screenshot-matrix clause conflicts with a prior decision** — see above; needs the lead.
2. **i18n migration is the largest and riskiest chunk**: every test asserting visible text is
   coupled to it. Split across two increments (6, 7) and keep the English strings byte-identical so
   tests do not need rewriting — if a test breaks, that is a real regression, not churn.
3. **The lint guard will have false positives.** It must exempt `className`, test ids, aria tokens
   and `data-*`. A guard that cries wolf gets disabled, which is worse than not having one.
4. **Bundle budget**: a context-menu primitive plus the catalog add weight to a gated budget
   (`test:perf`). Measure before assuming headroom.
5. **Scope creep flagged, not planned:** actual translations, RTL layout, locale-aware
   number/date formatting beyond what `lib/format.ts` already does.
