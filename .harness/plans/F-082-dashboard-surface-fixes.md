# Plan: F-082 Dashboard surface fixes — graph chrome + panel overflow, search clipping, settings, signin

- **Feature:** F-082 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-49, NFR-14
- **Service / package:** apps/web
- **Author:** Claude (Opus 4.8) · **Date:** 2026-07-17

## Intent

Maintainer review items 6, 7, 8, 10, 16. Five reported surface defects — four of which turned out to
have a specific mechanical cause, found by reading rather than by restyling.

## Diagnoses (each verified in code, not assumed)

**#6 — graph chrome.** `MiniMap` + `Controls` are library chrome; they go. The **attribution stays**
(maintainer decision): `@xyflow/react` is MIT, so hiding it is legally permitted, but xyflow asks
you to subscribe to React Flow Pro if you do, and this repo keeps its attributions (NOTICE.md,
ADR-0013/0021/0038). It is restyled to read as a credit rather than a badge — in CSS, because the
element is rendered by the library.

**#7 — panel overflows the page.** The canvas is a fixed `h-[65vh]`
([`graph-canvas-impl.tsx:79`](../../apps/web/components/graph/graph-canvas-impl.tsx)); the panel
Card has **no cap at all**, and its effects list is **uncapped** (`effects.map`) where Connections
slices to 20. So a high-degree node grows the grid row past the canvas and pushes the page — exactly
as reported, and only in Effects mode.

**#8 — "cards cut off on the left".** The cards are fine; the **scroll container** is the bug.
[`search-view.tsx:288`](../../apps/web/components/search/search-view.tsx) is
`overflow-y-auto … pr-1` — a gutter on the right only. `overflow-y: auto` forces the x-axis to clip
too, and the active row paints a 2px `ring` **outside** its border box, so the left edge gets shaved
while the right (which has `pr-1`) looks correct. Symmetric padding fixes it.

**#10 — settings.** The icons go (asked). But the icon is not what separates Appearance from the
rest — Appearance uses the *same* icon+title header; its **content** is what differs (fieldsets,
legends, real controls, live state). The genuine weakness is **Governance**: a paragraph of prose
that buries three facts in one sentence and leaks an internal requirement id (`NFR-13`) at the user,
with no `CardDescription` where every sibling has one.

**#16 — signin badge.** Delete; drop the now-unused `Sparkles` import.

## Approach

Mechanical fixes, each at the layer where the defect actually is:

1. Remove `MiniMap`/`Controls`; style `.react-flow__attribution` muted + low-opacity, legible on
   hover, **never** `display:none` by another name.
2. Panel: `lg:max-h-[65vh] lg:overflow-y-auto`, plus `role="region"` + `tabIndex` — in Effects mode
   the panel contains **nothing focusable**, so without it a keyboard user cannot reach the very
   overflow being fixed (axe `scrollable-region-focusable`, WCAG 2.1.1).
3. Search: `pr-1` → `px-1`.
4. Settings: strip the four header icons; unify on title + description; rewrite Governance into the
   definition-list grammar the Deployment card already uses; point Plans at Profile for "your plan"
   (Profile already owns that, so the table is honestly a catalog).
5. Signin: delete the badge.

## Files to touch

- `apps/web/components/graph/graph-canvas-impl.tsx`, `graph/graph-side-panel.tsx`
- `apps/web/app/globals.css` (attribution), `apps/web/eslint.config.mjs` (`region` allowance)
- `apps/web/components/search/search-view.tsx`
- `apps/web/components/settings/{settings-view,appearance-settings}.tsx`
- `apps/web/app/signin/page.tsx`

## Anticipated effects

- **Client-only**; no API/contract change, nothing in `effects.json` invalidated.
- `eslint.config.mjs` gains a second narrow `no-noninteractive-tabindex` allowance (`region`),
  alongside F-080's `ul`. Both are scrollable regions where axe and jsx-a11y genuinely conflict.
- `graph-view.test.tsx` / `search-view.test.tsx` / `settings-view.test.tsx` are the regression
  surface.

## Test plan

- **Regression:** existing web suites stay green untouched.
- **e2e/a11y:** `graph.spec.ts`, `search.spec.ts`, `settings.spec.ts`, `auth.spec.ts` — including the
  axe WCAG A/AA sweeps, which is what proves the panel's `tabIndex` rather than asserting it.
- **Visual:** screenshot graph (attribution + bounded panel) and settings.

## Verification

Gates: `state`, `typecheck`, `lint`, `format`, `test`, `build` + the e2e specs above.

## Risks / open questions

- **Scope split:** the inspector rebuild (item 9) moved to **F-086**. It is ~1022 lines across six
  components and was rebuilt by **F-062 ("Inspector v2") three commits ago** — the maintainer is
  looking at *that* and still calling it unprofessional, so the gap is design judgment, not a missing
  pass. Tacking a rushed restyle onto a batch of one-line fixes would just reproduce F-062.
- Removing `Controls` removes the zoom buttons; zoom/pan remain by wheel + drag, and the side panel
  is already the documented keyboard-accessible alternative to the canvas (F-043). Worth watching
  that this does not become an accessibility regression for pointer-only zoom.
