# Plan: F-090 Graph explorer — a readable default zoom, a panel that stands level with the canvas

- **Feature:** F-090 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-42, FR-19, FR-49, NFR-14
- **Service / package:** apps/web
- **Author:** Claude (Fable 5) · **Date:** 2026-07-18

## Intent

User items 7 + 8 (2026-07-18 report): *"the KG should already be zoomed in to a default value —
currently it's too zoomed out to capture the whole KG"*, and *"the detail/inspect component should be
aligned with the KG component in position and size; its UI/UX is not professional — overhaul it"*.

## Item 7 — fit, but never to dust

`fitView` fits the entire graph at whatever zoom that takes; at 500 nodes that is confetti. The fix
is a **clamped fit**: `fitViewOptions.minZoom` so the initial view never opens below a readable zoom
(large graphs open centered and legible; the rest is one scroll away), and `maxZoom: 1` so a
three-node graph does not balloon. Manual zoom range (0.1–2) is untouched — the clamp shapes the
*default*, not the user's reach.

## Item 8 — alignment first, then the overhaul

**Alignment (mechanical):** the left column stacks a `text-xs` count line above the canvas, so the
panel card tops out ~24px *north* of the canvas — exactly what was reported. The count moves into
the canvas as a React Flow `Panel` chip (it is canvas metadata); both grid columns then start at the
same y. The panel becomes `lg:h-[65vh]` (not `max-h`) — same size as the canvas, scrolling
internally.

**Overhaul (design-review discipline — before-screenshots, then the smallest set that resolves):**

- **Empty state earns its keep:** full-height, centered, and it teaches — the node-kind **legend**
  (kind dot → label, the same `KIND_ACCENT` tokens the canvas uses) which currently exists nowhere,
  plus the select hint. No dead card floating at arbitrary height.
- **Selected header:** kind accent dot + kind label + a deselect control; the key in mono
  (`break-all`), label below; quiet — no nested boxes (F-086's lesson stands).
- **Connections become navigation:** grouped **Incoming / Outgoing** with counts, each row a real
  button that selects that node (today the rows are inert text); hover surface; the same 20-cap with
  an honest "+N more" line.
- **Effects list reads as ranking:** score rendered as a thin meter (primary token) beside the
  tabular number; path stays but truncates middle-out; rows stay flat surfaces, not bordered boxes.
- A11y: the region/tabIndex scroll semantics stay; buttons get names; axe + contrast gates.

## Verification

- `graph-view.test.tsx` updated/extended: legend in empty panel, connection click selects,
  alignment classes.
- Before/after screenshots (dark + one light theme) via the design-review pass; axe WCAG A/AA on the
  graph e2e; full web gates.

## Effects

- None beyond apps/web (no API change). E-004 (design tokens) respected — tokens only.
