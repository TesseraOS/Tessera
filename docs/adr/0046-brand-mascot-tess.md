# ADR-0046: Brand mascot "Tess" — shared tessera-built character with data-driven moods

- **Status:** Accepted **v3** (v1/v2/v3 2026-07-11 — two stakeholder review rounds, §Amendments)
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

## Amendment v2 (2026-07-11) — alive, cute, interactive (stakeholder review)

The v1 figure was reviewed as *lifeless and non-interactive*: two placements sat under
`pointer-events-none` (hover/click could not fire), no placement was interactive, the
9–14s ambient rates read as stillness on a character, and a faceless block figure does
not read as a creature. The stakeholder directed: *"a small cute attention-seeker — a
lively child or pet that can also act as an assistant."* (This repeats the recorded
F-051 lesson: this brand reads austerity as lifelessness.)

Amended decisions:

1. **Tess has a face.** Big-head cute proportions (head tile 26×22 over the mosaic body)
   with **two ink eyes** — blinking, glancing, and following the pointer. §1's
   "no face" and BRAND's cartoon ban are amended to: *no gloves, no limbs, no
   mouth-driven cartoon acting — a minimal eye pair is REQUIRED for liveliness*
   (precedent: GitHub Mona, Discord Clyde, the Twitch Glitch — geometric mascots whose
   eyes carry the life). Eyes are mood data: `defineMood()` gains validated
   `eyes: { openness, gazeX, gazeY }`.
2. **Character motion runs at creature rate:** breath/bob 3–6s (THERMAL character bounds
   3000–6000ms), periodic blink windows, per-mood gestures (curious tilt, alarmed
   shiver, lost/searching scan, greeting wave, celebrating heart pop). The 9–14s ambient
   spec remains correct for FIELD art (MosaicField, shader) — a character is not a
   field. Tess still counts as the viewport's one ambient system; transform/opacity
   only; reduced motion still freezes to the designed pose.
3. **Reactive by default on every placement:** hover = perk + gaze lock + ember flare;
   click/tap = the one-shot **delight** reaction (hop, happy-squint, heart re-seat,
   sheen — ≤1.2s, absorbed while playing). Decorative instances remain `aria-hidden`
   with **no tab stop**: the reaction is a keyboard-neutral easter egg conveying no
   information; `interactive` (real button) mode remains for genuine controls.
   **Placements must never sit inside `pointer-events-none`.** Pointer tracking is
   rAF-smoothed, wanders when idle ("attention-seeking"), is disabled under reduced
   motion, and renders SSR-neutral markup (gaze defaults 0,0 — hydration-safe).
4. **A `/dev/mascot` lab route** on the marketing app: all moods × sizes, reactive
   playground, both themes. `robots: noindex`, excluded from sitemap/nav/llms.txt; the
   design-lint usage budget gains the lab files as a sanctioned dev exception
   (manifest 4.7.0).
5. **Placement principle:** the mascot fills existing whitespace (overlay positioning),
   never creates it — the menu instance overlays the corner above the mosaic strip with
   zero added layout height.

## Amendment v3 (2026-07-11) — moods are ACTIVITIES; hands; props (stakeholder review)

v2 was reviewed as still reading idle: *"liveness is the mascot DOING something — all
moods should be smooth infinite activity animations; pointer tracking on a static figure
isn't liveness."* Reference studied: the Senzops sentinel bot (arms + per-mood props —
laptop, log sheet, crate — with infinite task loops). The stakeholder also proposed the
anatomy change (adopted) and flagged the celebrating sheen as box-revealing (removed).

1. **Anatomy (stakeholder proposal, adopted):** six pieces — head, **the gilded heart AS
   the body** (Tess is literally the arriving gilded tile), **two hands** (limbs with a
   wider validated offset budget), two feet. The torso rows are gone; rose/clay move to
   the props and a warm **blush**.
2. **Every mood is an activity loop:** working = typing on a bench tile while output
   ticks flicker; searching = a **mini knowledge graph** floats up-left and Tess sweeps
   it node by node; curious = chin-tap thinking; alarmed = hands thrown up, trembling at
   the shivering loose tile; celebrating = cheering under falling **confetti tesserae**;
   greeting = a real wave; lost = head-scratching while scanning; satisfied = hands on
   hips, chest swelling; watching = a slow lookout turn. Props are ALWAYS in the DOM
   (SSR-identical markup); `[data-mood]` CSS shows the active one and runs its loop.
3. **The sheen is removed** (its full-height sweep revealed the svg bounding box). The
   celebration light is now the confetti + heart pop; the click delight bursts confetti.
4. **Menu placement corrected again:** Tess lives in the empty right half of the menu's
   link column, z-layered above the full-width link rows (tapping Tess never follows a
   link) — still zero added layout height.

## References

- [`BRAND.md`](../design/BRAND.md) · [`MARKETING-DESIGN.md`](../design/MARKETING-DESIGN.md)
  (v4.6) · [`marketing-design.manifest.json`](../design/marketing-design.manifest.json)
- Related: ADR-0043 (brand), ADR-0044 (dual themes), ADR-0045 (v4 system)
- Plan: [`.harness/plans/F-066-brand-mascot.md`](../../.harness/plans/F-066-brand-mascot.md)
- Effects: E-022 (marketing design contract), **E-023** (mascot contract → consumers)
