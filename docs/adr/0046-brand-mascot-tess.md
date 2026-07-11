# ADR-0046: Brand mascot "Tess" — shared tessera-built character with data-driven moods

- **Status:** Accepted
- **Date:** 2026-07-11
- **Deciders:** stakeholder (name, scope, mood set — confirmed 2026-07-11) + agent (design/packaging)
- **Tags:** brand, frontend, marketing, shared-package

## Context

F-066 calls for a brand mascot. The brand book ([`BRAND.md`](../design/BRAND.md)) bans
"cartoon mascots" but its whole identity — *one gilded piece arriving to complete the
picture* — is already a character waiting for a body. The original F-066 entry scoped the
rig to `apps/marketing/components/art/*`; the stakeholder directed that the mascot serve
**every frontend** (marketing now; dashboard and docs later).

Forces:

- **Two design systems, one figure.** Marketing speaks Terra Mosaic tokens
  (`--rose/--gold/--clay`); the dashboard speaks a neutral monochrome vocabulary
  (DESIGN-SYSTEM.md). A shared component cannot hardcode either.
- **Marketing's motion seam.** design-lint makes `lib/motion.tsx` the only framer-motion
  import in `apps/marketing`; a framer-dependent package would break the seam or smuggle a
  second entry point past LazyMotion's strict mode.
- **Recorded lesson classes.** Framer SVG `x/y` props override the SVG `transform`
  attribute, and branching SSR'd markup on `useReducedMotion()` hydration-mismatches
  (F-051 v4.5). A rig that avoids both classes structurally is worth a packaging decision.
- **Brand guardrails.** No eyes-and-gloves cartoon; token-colored; thermal motion
  (settle/drift/glow, never bounce/spin); accent budget (gold ≤1 moment per band).

## Decision

1. **The mascot is Tess** — a compact figure of **nine rounded-square tesserae** (the
   logo's own geometry) whose **heart slot is always the gilded ember tile**. Personality:
   *the archivist's apprentice* — curious, patient, precise. Tess has **no face**:
   expression comes from **posture** (tile arrangement), **alignment** (a misplaced tile
   is distress; a seated grid is satisfaction), **rhythm** (heart-glow breathing + tile
   drift cadence), and **light** (one sheen sweep as the arriving-tile gesture).
2. **Moods are data, not code.** Core set (locked): `idle`, `curious`, `working`,
   `satisfied`, `alarmed`, `celebrating`. Surface set: `greeting` (menu), `lost` (404 —
   one tile visibly missing), `searching` (empty states), `watching` (telemetry
   supervisor). A typed `defineMood()` API validates custom moods (all slots covered,
   thermal budgets respected, reduced-motion still pose mandatory).
3. **Tess ships as `@tessera/mascot`** (`packages/mascot`) — the first shared UI package.
   React is a peer dependency; **zero runtime dependencies**; built like
   `@tessera/billing` (tsc → ESM + d.ts) plus a `styles.css` export.
4. **Motion is CSS-driven inside the package** (keyframes/transitions, transform/opacity
   only, the house easing). No framer-motion: the marketing seam stays intact, consumers
   inherit no animation library, transitions are interruptible by construction, and
   reduced motion is a pure `@media (prefers-reduced-motion)` block — server markup is
   identical in every state (the v4.5 hydration rule holds structurally).
5. **Theming is a closed CSS-variable contract:** `--mascot-tile`, `--mascot-tile-warm`,
   `--mascot-tile-deep`, `--mascot-heart`, `--mascot-sheen`, `--mascot-ink`. Each app
   binds these to its own tokens; unbound consumers degrade to a monochrome
   `currentColor` figure (the logo's own fallback stance) — never off-brand color.
6. **Usage budget (marketing):** mobile-menu ground, 404/empty states, and the
   constellation supervisor — **never the hero, never pricing**. Enforced by a design-lint
   `allowIn` pattern. **Accent-budget interaction:** where Tess appears, its gilded heart
   **is** that band's one gold moment.
7. **Accessibility:** decorative placements are `aria-hidden` with a sibling text
   alternative where the surface needs one; interactive placements are real buttons with
   labels; **Tess is never the sole carrier of information** — it mirrors state that is
   already rendered as text.
8. **Brand masters are generated, not drawn:** `docs/design/brand/tessera-mascot.svg` and
   `tessera-mascot-moods.svg` render deterministically from the package's mood data
   (drift-tested), so brand assets cannot diverge from the shipped rig.
9. **Dashboard adoption is F-068** (backlog, blocked by F-066): binding the contract into
   the dashboard's monochrome vocabulary is that surface's own recorded design decision
   under DESIGN-SYSTEM.md — not smuggled in here.

`BRAND.md` gains a mascot section and its "cartoon mascots" ban is amended to "no
eyes-and-gloves cartoon mascot; the geometric tessera figure (Tess) is sanctioned within
the usage budget". `MARKETING-DESIGN.md` + manifest move to v4.6 in lockstep.

## Consequences

### Positive

- One rig serves every current and future frontend; moods extend as data without code.
- The package cannot regress marketing's bundle or motion discipline (no deps, CSS-only).
- Brand asset drift is structurally impossible (generated masters + drift test).
- The two recorded animation lesson classes cannot recur inside the rig.

### Negative / Costs

- A second UI idiom (CSS keyframes) exists alongside framer — justified by the seam and
  portability, but reviewers must know the rig animates itself.
- The `--mascot-*` contract is one more cross-package surface to keep stable (tracked as
  effect-link E-023).
- Generated masters must be regenerated when mood data changes (enforced by test).

### Neutral / Follow-ups

- F-068: dashboard adoption (empty/error states) under DESIGN-SYSTEM.md governance.
- Docs surface adoption when `apps/docs` exists (no feature yet).
- If a future surface needs sprite/raster exports (social, stickers), extend the
  master-generation script — never hand-draw.

## Alternatives considered

- **Marketing-only rig in `components/art/*` (original F-066 scope)** — rejected by
  stakeholder direction: the mascot must be reusable across frontends; porting later
  would mean re-implementing the rig against a second design system.
- **Framer-motion rig via the marketing seam** — strongest inside marketing, but
  unusable elsewhere without dragging framer into every consumer; also re-exposes the
  SVG-transform and reduced-motion-hydration lesson classes.
- **Lottie/Rive animation file** — heavy runtime, opaque binary source of truth,
  token-theming impossible (bakes colors), violates "tokens only".
- **Static SVG poses without a rig** — no interactivity or telemetry reaction; fails the
  feature's brief (interactive, animated, mood-driven).

## References

- [`BRAND.md`](../design/BRAND.md) · [`MARKETING-DESIGN.md`](../design/MARKETING-DESIGN.md)
  (v4.6) · [`marketing-design.manifest.json`](../design/marketing-design.manifest.json)
- Related: ADR-0043 (brand), ADR-0044 (dual themes), ADR-0045 (v4 system)
- Plan: [`.harness/plans/F-066-brand-mascot.md`](../../.harness/plans/F-066-brand-mascot.md)
- Effects: E-022 (marketing design contract), **E-023** (mascot contract → consumers)
