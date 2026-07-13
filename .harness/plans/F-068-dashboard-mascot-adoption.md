# Plan: F-068 Dashboard mascot adoption — ABSORBED INTO F-070

- **Feature:** F-068 ([`../state/feature_list.json`](../state/feature_list.json))
- **Status:** done (2026-07-12) — **absorbed into [F-070](F-070-dashboard-overhaul.md)**.

## Why this file is a redirect

F-068 (Tess in dashboard empty/error states) was folded into the broader **F-070 dashboard
experience overhaul** at stakeholder direction (2026-07-12), because the mascot binding,
usage budget, and governance are the same design decision as the theme/illustration work.
Doing them together avoided binding `--mascot-*` twice and kept one ADR + one DESIGN-SYSTEM
amendment.

The authoritative plan, acceptance mapping, and verification evidence live in
[`F-070-dashboard-overhaul.md`](F-070-dashboard-overhaul.md) (Workstream 2 — illustration
layer + mascot) and [ADR-0047](../../docs/adr/0047-dashboard-multi-theme-illustration-layer-contrast-gate.md).

## What shipped for F-068 (under F-070)

- `@tessera/mascot` added to `apps/web`; `styles.css` imported once in `app/layout.tsx`.
- The closed `--mascot-*` contract bound **per theme** in `app/globals.css` (gilded heart =
  a fixed brand ember, overridden to Amber/Claude's warm `--primary`) — governed by
  DESIGN-SYSTEM §11 (not MARKETING-DESIGN), the recorded design decision ADR-0047 asked for.
- Usage budget (empty / error / 404 / onboarding — never headers, nav, or data views):
  `EmptyState`/`ErrorState` gained `mascot` slots; search/memory empties use `searching`,
  error states use `alarmed`, `app/not-found.tsx` uses `lost`, the overview activity empty
  uses `watching`. Decorative `aria-hidden`; text remains the information carrier.
- Reduced-motion still poses verified; all themes screenshot-verified; effect **E-023**
  gained the `apps/web` consumer. No new runtime dep beyond `@tessera/mascot`.
