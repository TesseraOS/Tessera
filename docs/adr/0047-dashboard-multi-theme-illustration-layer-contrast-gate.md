# ADR-0047: Dashboard multi-theme system, expressive illustration layer, and an executable contrast gate

- **Status:** Accepted
- **Date:** 2026-07-12
- **Deciders:** Project lead (stakeholder review + theme selection), Claude
- **Tags:** frontend, design, web, accessibility
- **Supersedes (in part):** [ADR-0023](0023-adopt-efferd-dashboard-3-design-reference.md) — its *color* constraints (monochrome-only, dark-only-first, "no brand hue") stop being binding; its layout/structure/honesty decisions stand unchanged.

## Context

The 2026-07-12 stakeholder review judged the dashboard "too dull, lifeless, lacking design
and creativity … most pages lack illustrations … we want an Awwwards-grade dashboard." This
is the same reading that already reshaped marketing twice (F-051 v3/v4, F-067 v2 — recorded
lesson [[design-contract-mechanism-outlives-parameters]]: this lead reads austere minimalism
as lifeless). The stakeholder also directed, concretely:

1. Four selectable **themes** — the current efferd token set (named **Monkai**, stays
   default) plus three tweakcn themes: **Amber** (`amber-minimal`), **Claude** (`claude`),
   **Notebook** (`notebook`) — each with **light + dark** modes and a light/dark toggle.
2. Theme/mode switches must **propagate radially from the switching control** (the
   marketing footer-toggle pattern), never abruptly.
3. Add **creative, polished, interactive, animated illustrations** where they fit — and the
   **Tess mascot** where it fits (F-068's exact scope).
4. **WCAG AA contrast (≥ 4.5:1)** as a rule + skill ("Contrast Checker").

Forces:

- ADR-0023 made efferd Dashboard 3 binding *including* "monochrome, no brand hue" — a
  four-theme catalog with amber/terracotta primaries cannot exist under it. Deviation
  requires this superseding ADR; what ADR-0023 got right (shell structure, flat honest
  surfaces, first-class empty states, no fabricated data, Lucide, stat-card grammar) is
  not in dispute.
- `next-themes` owns light/dark via the `.dark` class; shadcn tokens are single-set
  (`:root`/`.dark`). Running `shadcn add <tweakcn-url>` would **overwrite** that single
  set — it cannot express four coexisting themes.
- Each tweakcn theme carries its own **fonts** (Amber: Inter/Source Serif 4/JetBrains
  Mono; Notebook: Architects Daughter/Fira Code; Claude: system stacks), **radius** and
  **shadow scale** — theming is more than colors.
- tweakcn palettes are not contrast-audited; some pairings fail AA. The current Monkai set
  has its own soft spots (e.g. dark `--input` ≈ 1.5:1 against the canvas as a non-text
  boundary). An aspirational "meets WCAG AA" line in DESIGN-SYSTEM.md §2.1 has existed
  since v1 with nothing enforcing it.
- Marketing already solved the ripple (`useThemeTransition`:
  `startViewTransition` + clip-path circle from the control, reduced-motion/unsupported →
  instant) and the art idiom (server-rendered token-driven SVG, CSS-only motion,
  kill-switch, `aria-hidden`); `@tessera/mascot` (ADR-0046) ships a closed `--mascot-*`
  contract with a monochrome fallback. The dashboard reuses the *patterns*, never
  cross-app imports (package-boundary lint).

## Decision

**1. Theme catalog — four themes × two modes, one default.**
`<html>` carries two orthogonal axes: **mode** (`.dark` class, owned by next-themes:
light/dark/system, unchanged) and **theme** (`data-theme="monkai|amber|claude|notebook"`).
Monkai is the default and keeps the **exact existing values** as the classless
`:root`/`.dark` blocks — zero visual regression by construction. The three tweakcn themes
are **vendored** (from their registry JSONs) into scoped blocks in `apps/web/app/themes.css`
(`[data-theme='amber']`, `[data-theme='amber'].dark`, …) with the full role set: colors,
`--chart-*`, `--sidebar-*`, `--radius`, `--shadow-*`, and per-theme
`--font-sans/serif/mono`. Theme choice persists in `localStorage('tessera.theme')` and is
applied by a pre-paint inline script (no flash of default theme). Theme fonts are
self-hosted via `next/font` with `preload: false` (loaded only when a theme referencing
them is active; Claude's system stacks cost nothing; Geist remains Monkai's face).

**2. Appearance changes propagate radially from the control.**
The marketing ripple is ported to `apps/web/lib/theme.tsx` and generalized: one
`document.startViewTransition` wraps theme *and/or* mode changes, animated as a clip-path
circle growing from the pressed control. Instant fallback when the API is missing, under
`prefers-reduced-motion`, or with no origin. Switch surfaces: a header
**AppearanceSwitcher** (mode segment + theme picker with swatches), the ⌘K palette, and a
`/settings` Appearance card.

**3. An expressive illustration layer, budgeted.**
`apps/web/components/art/` adopts the marketing art idiom under **dashboard tokens**:
server-rendered SVG, CSS-only motion, reduced-motion kill-switch, decorative instances
`aria-hidden` with text as the information carrier, honest (illustrations never fabricate
data). Signature arts map to product truths (constellation/graph, compiler assembly,
retrieval signal field, memory strata, ingest pipeline, audit ledger, timeline river).
**Usage budget:** empty states, error states, the 404, onboarding/first-run, and the
overview hero band — **never** headers, navigation, or data views (tables, results,
traces). `EmptyState`/`ErrorState` gain optional `art`/`mascot` slots.

**4. Tess joins the dashboard (F-068 absorbed).**
`apps/web` takes the `@tessera/mascot` dependency and binds the closed `--mascot-*`
contract **per theme** in `globals.css` (the gilded heart maps to each theme's warm accent;
Monkai binds its neutral ramp with the heart as the one warm moment — consistent with the
emerald/red functional-accent rule because the mascot only appears on non-data surfaces).
Placements per the same budget: empty (searching/watching), error (alarmed), 404 (lost),
overview onboarding (greeting).

**5. Contrast stops being aspirational — rule + skill + executable gate.**
New rule [`.harness/rules/frontend/contrast.md`](../../.harness/rules/frontend/contrast.md)
and skill `contrast-checker`: WCAG 2.x AA — **≥ 4.5:1** normal text pairs, **≥ 3:1** large
text and non-text UI (focus ring, input boundaries) — over a **registered list of token
pairings**. An executable checker (`apps/web/tests/contrast.test.ts`, zero-dep
oklch/hex→sRGB→relative-luminance math) asserts every registered pairing across **all four
themes × both modes** inside the standard `test` gate. Vendored tweakcn values that fail
get **minimally nudged** (smallest oklch-lightness change that passes; noted as CSS
comments); Monkai's own failures are fixed the same way. Fix the token, never the check.

**6. Enforcement.** DESIGN-SYSTEM.md v2 + `design-system.manifest.json` record the
catalog, mechanism, art/mascot budgets, and contrast pairs in lockstep. efferd Dashboard 3
remains the binding reference for **layout, shell structure, information design, and
honesty**; §0's color clause now applies to the Monkai theme rather than the dashboard as
a whole.

## Consequences

### Positive
- The dashboard gains brand personality and an enterprise theming story (a real
  differentiator for a dev-tool dashboard) without touching the data layer.
- Accessibility improves concretely: contrast is now *measured* across 8 theme-mode
  combinations on every test run, catching regressions the aspirational line never could.
- Reuse: marketing's proven ripple/art/mascot patterns amortize across surfaces.

### Negative / Costs
- Four themes multiply the design-review surface (screenshot matrix 4×2); the contrast
  gate and token-only discipline keep this mechanical rather than subjective.
- `themes.css` adds ~3 vendored token sets to maintain; tweakcn upstream changes are not
  tracked automatically (vendoring is deliberate — values are ours once nudged for AA).
- View Transitions API is not universal (older Firefox/Safari) — those users get an
  instant switch (acceptable, proven in marketing).

### Neutral / Follow-ups
- F-060/061/062/063 (live overview data, search depth, inspector v2, data tables) are
  untouched and remain the next dashboard features; the overhaul deliberately makes no
  data-layer changes.
- A `design-lint`-style enforcement suite for apps/web (banned patterns like hardcoded
  colors) is a natural follow-up if drift appears; the contrast test is its first brick.

## Alternatives considered
- **`pnpm dlx shadcn add <theme-url>` as directed literally** — rejected: it overwrites
  the single `:root`/`.dark` set; four coexisting themes are impossible; Monkai would be
  destroyed. Vendoring the same registry JSONs into scoped blocks preserves intent
  (the stakeholder wants the *themes*, not the CLI mechanics).
- **next-themes multi-theme values (`themes: ['monkai-dark', 'amber-light', …]`)** —
  rejected: conflates the mode and theme axes, breaks `system` mode semantics, and makes
  every consumer theme-aware. Two orthogonal attributes keep components token-only.
- **A colors-only theme switch (shared fonts/radius)** — rejected: the chosen tweakcn
  themes derive much of their character from type (Notebook's hand-drawn face, Amber's
  Inter) and geometry; colors-only would produce four skins that all feel like Monkai.
- **Contrast as documentation or manual audit** — rejected: that is the status quo that
  never enforced anything; only an executable check in the `test` gate survives drift.

## References
- [ADR-0023](0023-adopt-efferd-dashboard-3-design-reference.md) (superseded in part),
  [ADR-0044](0044-marketing-v3-dual-themes-illustration-first-live-graph.md) /
  [ADR-0045](0045-marketing-v4-constellation-shader-hero-theme-true-chapters.md) (ripple +
  art idiom), [ADR-0046](0046-brand-mascot-tess.md) (mascot contract).
- tweakcn theme registry: <https://tweakcn.com/r/themes/amber-minimal.json>,
  <https://tweakcn.com/r/themes/claude.json>, <https://tweakcn.com/r/themes/notebook.json>.
- WCAG 2.1 SC 1.4.3 (contrast minimum) + SC 1.4.11 (non-text contrast).
- Plan: [`.harness/plans/F-070-dashboard-overhaul.md`](../../.harness/plans/F-070-dashboard-overhaul.md).
