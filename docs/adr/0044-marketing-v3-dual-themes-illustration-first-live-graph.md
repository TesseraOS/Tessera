# ADR-0044: Marketing v3 — dual themes, illustration-first (no terminal mockups), live-graph hero

- **Status:** Accepted (builds on ADR-0043's Terra Mosaic brand and ADR-0042's enforcement mechanism)
- **Date:** 2026-07-07
- **Deciders:** Project lead (explicit review directives) + F-051 session
- **Tags:** frontend, design, brand, marketing, harness

## Context

The second stakeholder review moved the bar again, with specific directives: terminal/
file-system mockups are **rejected outright** as marketing visuals ("this is a marketing
site"); the hero must carry a **live, interactive, animated knowledge graph** built on a
trusted graph package (hand-drawn SVG edges had alignment/overflow defects); the site gets
**two themes** — theme-factory's **Desert Rose as dark** and **Modern Minimalist as
light** — toggled from the footer; the nav should be transparent at the top of the page;
the mobile menu must be a full-screen experience; the scrollbar should be branded; text
typography should be a distinctive professional face (not a near-default grotesque); and
every illustration must be interactive/animated art, not UI cosplay. Awwwards research
(design 40 / usability 30 / creativity 20 / content 10; winners share bold type, smooth
motion, technically advanced interactivity) supports all of it.

## Decision

1. **Dual themes over one token architecture.** `:root` carries Desert Rose **dark**
   (default); a `.light` class carries the Modern Minimalist–derived **light** theme
   (near-white `#FBFBFC`, charcoal `#2A353F`, slate muteds — brand rose/gold shift to
   their deep variants). Managed by **next-themes** (class attribute, default dark, no
   system auto in v1); the toggle lives in the **footer**. Components stay tokens-only —
   the `dark:`-variant ban survives unchanged; the sand chapter band re-tokenizes per
   theme. Sanctioned gradients/`.text-ember`/atmosphere re-declare per theme in globals.
2. **Illustration-first policy (hard rule).** Marketing surfaces never show terminal
   windows, code-block panels, file trees, or dashboard-chrome mockups. Product truths are
   told through **brand-language art**: the mosaic/tessera vocabulary, flowing pipelines,
   assembly scenes, gates. The compile trace, MCP tool list, and audit panel from v2 are
   deleted, replaced by animated illustrations (SVG + the motion seam).
3. **Hero = the product, alive.** A **full-bleed interactive knowledge graph** (the
   in-house-trusted `@xyflow/react`, already the dashboard's graph engine — ADR-0021/F-043)
   covers the hero: draggable token-themed nodes (sources → tessera hub → agents), animated
   bezier edges, randomized **simulated telemetry** ticking (requests/min, tokens served,
   active agents — visibly labeled *demo*, honesty rule intact), edge pulses. Loaded
   `ssr:false` behind the server-rendered H1 (LCP untouched); `zoomOnScroll` off (no
   scroll hijack); keyboard-a11y disabled + `aria-hidden` with a text alternative
   (decorative-interactive canvas); reduced motion ⇒ static graph, frozen numbers.
4. **Typography v3:** display stays **Instrument Serif** (the voice); text/UI moves to
   **Manrope** (distinctive, enterprise-grade humanist grotesque); mono moves to
   **JetBrains Mono** (the developer-culture face). All next/font self-hosted.
5. **Chrome polish as spec:** nav is **transparent at the top** and gains the dusk-glass +
   hairline after ~8px of scroll; the mobile menu is a **full-screen overlay** (staggered
   serif links, body scroll-lock, Escape/close, focus moved in); the **scrollbar is
   branded** (clay/rose thumb, both WebKit + `scrollbar-color`).

MARKETING-DESIGN.md v3 + manifest v3 carry the exact values; design-lint recompiles.

## Consequences

### Positive
- The hero demonstrates the product category (a living context graph) instead of
  describing it — the "technically advanced interactivity" jurors reward.
- One token architecture now serves two themes; future theming is data.
- The illustration policy is finally unambiguous — no future agent can ship a terminal
  screenshot as "art."

### Negative / Costs
- `@xyflow/react` (~45KB gz) + next-themes join the bundle; the graph chunk loads lazily
  (ssr:false) so first-load JS grows only by the theme runtime. Budget unchanged (240KB);
  Lighthouse enforcement still lands with F-049.
- Two themes double the visual QA surface: axe + screenshots must pass on both (e2e
  toggles the theme and re-scans).
- Simulated telemetry must stay visibly labeled "demo" — removing that label would break
  the honesty rule (review item).

### Neutral / Follow-ups
- The sand "chapter" survives in both themes as a per-theme band.
- WebGL/shader heroes were considered and remain deferred (ADR-0043 alternatives) — React
  Flow delivers the interactivity budget without GPU/battery/a11y costs; revisit only with
  a dedicated performance plan.
- System-preference auto-theming deferred until the toggle proves itself.

## Alternatives considered

- **Keep polished terminal mockups** — rejected: explicit stakeholder veto; marketing
  should sell outcomes and product shape, not developer chrome.
- **d3-force / hand-rolled SVG graph** — rejected: the defects being fixed (edge
  alignment, overflow) came from hand-rolling; React Flow is already trusted in-repo.
- **Three.js/shader hero** — deferred: heavier, worse a11y/battery story; React Flow
  satisfies "interactive + animated + relatable" and is product-true.
- **Theme toggle in nav** — rejected: stakeholder specified footer; nav stays minimal.

## References

ADR-0042 (mechanism), ADR-0043 (Terra Mosaic), ADR-0021/F-043 (React Flow precedent);
theme-factory Desert Rose + Modern Minimalist; BRAND.md; Awwwards evaluation research;
plan `.harness/plans/F-051-marketing-site.md`.
