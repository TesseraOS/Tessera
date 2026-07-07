# ADR-0043: Terra Mosaic brand + marketing design v2 — warm palette, serif voice, living motion

- **Status:** Accepted (amends ADR-0042 — same enforcement machinery, new design parameters)
- **Date:** 2026-07-07
- **Deciders:** Project lead (explicit direction) + F-051 overhaul session
- **Tags:** frontend, design, brand, marketing, harness

## Context

The first F-051 increment shipped under ADR-0042's parameters: near-black monochrome,
single emerald accent, Geist-only typography, CSS-only minimal motion. The project lead's
review verdict was unambiguous: **correct but lifeless** — "only text, no art, no emotion,
old-fashioned." The direction requested: an artistic, animated, award-grade surface
(Awwwards submission intent — scoring: design 40%, usability 30%, creativity 20%,
content 10%), a real logo and brand identity, warmer colors (explicitly: theme-factory's
**Desert Rose** and **Modern Minimalist**), aesthetic typography, animated hero art, and
microinteractions — while keeping enterprise-grade professionalism and accessibility.

The lesson for the harness: ADR-0042's *mechanism* (a binding doc + a machine-readable
manifest compiled into gate failures) worked exactly as designed — its *parameters*
encoded taste the stakeholder rejected. Parameters change; the mechanism stays.

## Decision

1. **Brand foundation.** Adopt [`docs/design/BRAND.md`](../design/BRAND.md) (brand
   discovery, metrics) and the [Terra Mosaic philosophy](../design/brand/terra-mosaic-philosophy.md)
   as the identity: *many tiles, patiently assembled; one gilded tile arriving*. Logo
   system (mark = 3×3 mosaic with a gilded arriving tile; wordmark = lowercase Instrument
   Serif) with committed SVG masters + a **deterministic Playwright renderer**
   (`apps/marketing/scripts/render-brand-assets.mjs`) producing the PNG exports and the
   brand canvas — logo assets are reproducible artifacts, not one-off files.
2. **Palette: "Terra Mosaic"** — the Desert Rose × Modern Minimalist fusion (BRAND §2):
   warm espresso-plum dusk ground (`#161013` family), warm ivory text, **dusty rose
   `#E2A3A8` primary accent + ember gold `#E4B65A` punctuation**, clay + burgundy
   supporting; a **sand light band** (`#F1E8DF`) gives pages a dusk → sand → dusk
   emotional arc. Two grounds, one theme — implemented as band-scoped custom properties
   (`data-band="sand"`), never `dark:` variants.
3. **Typography:** **Instrument Serif** (display, 400 + italic — emphasis is italic/scale,
   never bold) + **Instrument Sans** (text/UI) + **Geist Mono** (annotation register).
   Self-hosted via `next/font`; the closed 7-name scale keeps its names (display/title/
   heading/lead/body/small/label) so tooling (twMerge group, design-lint) is unchanged.
4. **Motion: "thermal" system, framer-motion admitted.** `framer-motion` (LazyMotion +
   `m`, strict mode) is allowed **only through the `lib/motion.tsx` seam** (design-lint
   enforces the import boundary) with `MotionConfig reducedMotion="user"`. Grammar:
   micro-interactions 150–250ms; scroll-reveals rise 16–24px once; **ambient life** (tile
   drift ≥8s loops ≤8px amplitude, marquee with hover-pause) is now sanctioned, ≤1 ambient
   system per viewport. Unchanged hard rules: LCP never animated from invisible, no
   scroll-jacking, reduced-motion = complete stillness, no `transition-all`.
5. **Sanctioned decoration (tokenized, not improvised):** gradients exist **only** as the
   two brand tokens (`--gradient-ember`, `--gradient-dusk`) plus the `.text-ember` display
   treatment — all defined once in `globals.css` (design-lint: gradient syntax allowed in
   that file only; gradient *utilities* stay banned). Soft shadows exist only as
   `--shadow-soft/--shadow-lift` (sand-band cards); SVG grain texture at ≤3% opacity kills
   flat-black lifelessness. Everything else from ADR-0042's ban list stays banned
   (glassmorphism, particle storms, raw palette classes, arbitrary values, hype copy,
   fabricated social proof).
6. **Budgets (BRAND §7, gate- or review-backed):** rose ≤3 elements/viewport, gold ≤1
   moment/band; ≤1 ambient system/viewport; first-load JS ≤160KB gz (motion library
   priced in); LCP <2.0s, CLS <0.05; axe AA remains a hard gate.

[`MARKETING-DESIGN.md`](../design/MARKETING-DESIGN.md) v2 and
[`marketing-design.manifest.json`](../design/marketing-design.manifest.json) v2 carry the
full specification; the design-lint suite recompiles automatically from the manifest.

## Consequences

### Positive
- The brand has an identity system (logo, palette, voice, art direction) rather than a
  styling; the site can carry emotion without losing the honesty/a11y/perf floor.
- The enforcement pipeline survives intact — one manifest edit re-aims the whole gate.
- Award-facing craft (motion, art, typography) now has *rules*, so future agents can be
  expressive without regressing into slop.

### Negative / Costs
- framer-motion adds ~30KB gz and a client boundary — priced into the JS budget; the
  LazyMotion seam and static-first pages keep it contained.
- Two grounds (dusk/sand) double the contrast-verification surface — mitigated by
  pre-verified pairs in BRAND §2 and axe on both bands.
- `next/font/google` fetches fonts at build time (cached thereafter) — accepted; fallback
  is committing the OFL TTFs (already in `docs/design/brand/fonts/`).

### Neutral / Follow-ups
- ADR-0042 remains the record of the enforcement mechanism; its §Decision visual
  parameters are superseded by this ADR.
- The dashboard (`apps/web`) is untouched; whether Terra Mosaic warmth migrates there is
  a future decision.
- Awwwards submission readiness is tracked in the F-051 plan (remaining pages must land
  first).

## Alternatives considered

- **Keep the austere direction, add small flourishes** — rejected: stakeholder feedback
  was categorical; a patched-up version of a rejected direction converges on mediocrity.
- **Full WebGL/canvas hero (three.js)** — rejected for v1: heavy dependency, GPU/battery
  cost, a11y complexity; SVG/CSS/framer-motion tessellations express the brand within
  budget. Revisit only with a dedicated performance plan.
- **Lottie/After-Effects animations** — rejected: binary assets, not token-themable, not
  brandable at runtime; SVG + code animations stay in the design system.
- **Buying a template/theme** — rejected: the brief is a distinctive brand; templates are
  the definition of the "AI slop" failure mode.

## References

BRAND.md; terra-mosaic-philosophy.md; ADR-0042 (mechanism), ADR-0035 (surfaces);
theme-factory Desert Rose + Modern Minimalist; Awwwards evaluation system (design 40 /
usability 30 / creativity 20 / content 10); plan `.harness/plans/F-051-marketing-site.md`.
