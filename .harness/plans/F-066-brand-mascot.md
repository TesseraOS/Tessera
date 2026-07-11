# Plan: F-066 Brand mascot — tessera-built character with moods, rig, and site integrations

- **Feature:** F-066 ([`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-67 (public surfaces), BRAND.md §1/§4/§7 (identity, logo system, thermal motion)
- **Service / package:** **`packages/mascot` → `@tessera/mascot`** (new, shared) + `apps/marketing` integrations
- **Author:** Claude (agent) with stakeholder direction · **Date:** 2026-07-11
- **Status:** ~~PROPOSED~~ **CONFIRMED** (2026-07-11) — OQ1–OQ3 resolved by stakeholder, see §Risks

## Intent

Give Tessera a brand mascot: a small living figure assembled from tesserae with the gilded
ember tile as its heart — the brand's core gesture ("one gilded piece arriving to complete
the picture") turned into a character. It ships as a shared, dependency-light workspace
package so every frontend (marketing now; dashboard/docs later) can adopt it, and lands on
the marketing site behind a strict usage budget: mobile-menu ground, 404/empty state, and
the constellation telemetry supervisor. **Never hero, never pricing.**

Done for a user: the mascot appears on the three sanctioned marketing surfaces, expresses
mood through tile arrangement/rhythm/light (not a cartoon face), reacts to hover/click,
respects reduced motion with designed still poses, passes axe on both themes, and the
package is documented + tested for future app adoption.

## Scope decision (stakeholder-directed deviation from the original entry)

The original F-066 entry scoped the rig to `apps/marketing/components/art/*`. The
stakeholder directed (2026-07-11) that the mascot must be reusable across frontends
(marketing, docs, dashboard). Consequences, to be locked in **ADR-0046**:

1. **New workspace package `@tessera/mascot`** — first shared UI package. React 19 as
   `peerDependency`, **zero runtime dependencies**. Built like `@tessera/billing`
   (tsc → ESM + d.ts). Marketing's "no dashboard imports" boundary is untouched — this is
   a neutral leaf package, same precedent as `@tessera/billing` → marketing.
2. **CSS-driven motion, no framer-motion in the package.** Rationale: (a) marketing's
   design-lint makes `lib/motion.tsx` the ONLY framer import — a framer-importing package
   would break the seam or blow the LazyMotion strict boundary; (b) portability — docs/
   dashboard shouldn't inherit framer; (c) CSS transitions are interruptible by nature
   (thermal rule); (d) it structurally avoids the two recorded lesson classes:
   framer-SVG transform-attribute conflicts and `useReducedMotion()` hydration mismatches
   (v4.5) — reduced motion is a pure `@media (prefers-reduced-motion)` concern, so server
   markup is always identical.
3. **Theming via a closed `--mascot-*` CSS variable contract** (documented in the package
   README): `--mascot-tile`, `--mascot-tile-warm`, `--mascot-tile-deep`, `--mascot-heart`,
   `--mascot-sheen`, `--mascot-ink`. Each app binds these to its own tokens (marketing:
   ivory/rose/clay/burgundy + gold heart per theme). Unbound apps degrade to a monochrome
   `currentColor` figure — mirroring the logo's monochrome fallback, never off-brand color.
4. `feature_list.json` F-066 gains the package note + amended acceptance (this plan is the
   detailed record); `progress.md` records the deviation.

## The character (locked by ADR-0046 + BRAND.md addendum)

- **Name:** **Tess** *(confirmed — OQ1)*.
- **Concept:** a compact figure of **9 rounded-square tiles** (the mark's own geometry
  language) arranged in named slots (crown, shoulder-l/r, heart, side-l/r, hip-l/r, base).
  The **heart slot is always the gilded ember tile** — its glow rhythm is the pulse that
  carries emotion. Reads from 24px (menu) to ~200px (404).
- **Personality:** the archivist's apprentice — curious, patient, precise; moves like warm
  air (BRAND §6), never bounces or spins.
- **Expression channels (no eyes, no gloves, no cartoon face):**
  - *Posture* — tile arrangement (gathered = attentive; low = idle; scattered = alarmed);
  - *Alignment* — a misplaced tile IS distress; a perfectly seated grid IS satisfaction;
  - *Rhythm* — heart-glow breathing rate + tile drift cadence;
  - *Light* — sheen sweeps once for celebration (the arriving-tile gesture).
- **Reconciliation with BRAND.md "no cartoon mascots":** the addendum amends the line to
  "no eyes-and-gloves cartoon mascot; the geometric tessera figure (Tess) is sanctioned
  within the usage budget" — the figure is abstract-geometric, an animated fragment of the
  logo, not a cartoon.

## Moods

Confirmed *(OQ3)*: **core 6 + 4 surface moods (10 predefined) + public `defineMood()` API.**

- **Core six** (general, ADR-locked): `idle`, `curious`, `working`, `satisfied`,
  `alarmed`, `celebrating`.
- **Surface moods** (predefined, placement-specific): `greeting` (menu open),
  `lost` (404 — one tile visibly missing, the heart searching), `searching` (empty
  states), `watching` (constellation supervisor; escalates to `alarmed`/`satisfied` off
  telemetry).
- **Extensibility:** a mood is *data*, not code — per-slot `{dx, dy, rotate, scale,
  opacity, colorRole}` + rhythm `{breathPeriod, drift, oneShot?}` + a mandatory
  reduced-motion still pose. `defineMood()` validates at type level and runtime (all slots
  covered, durations within thermal budget). Future apps add custom moods without touching
  the rig.

## Interaction (thermal, interruptible, reduced-motion-safe)

- **Hover:** acknowledge — figure rises ≤2px, heart brightens; 150–250ms ease-out (micro
  budget).
- **Click/tap** (only where `interactive`): one-shot re-seat — the heart tile lifts and
  clicks back into place with a single sheen sweep (≤1.2s, the signature gesture), then
  returns to the current mood. Interruptible (CSS transitions interpolate from current
  state).
- **Reduced motion:** zero movement; every mood renders its designed still pose; mood
  changes swap instantly without transition.
- **A11y:** decorative placements `aria-hidden="true"` (+ adjacent `sr-only` text where the
  surface needs it); interactive placements are real `<button>`s with `aria-label`. The
  mascot is **never the sole carrier of information** — the supervisor mirrors telemetry
  that is already rendered as text.

## Files to touch

**Governance first (before any code):**
- `docs/adr/0046-brand-mascot-tess.md` — name, personality, mood set, usage budget,
  non-goals, packaging deviation, CSS-motion decision.
- `docs/design/BRAND.md` — mascot addendum (§ new: anatomy, moods, budget, non-goals;
  amend the "cartoon mascots" line).
- `docs/design/MARKETING-DESIGN.md` + `marketing-design.manifest.json` (version bump) —
  sanctioned component `Mascot`, the **accent-budget interaction rule: where Tess appears,
  its heart IS that band's one gilded moment**, a 404-page archetype (§3 has no 404 shape),
  design-lint patterns (usage budget via `allowIn`).
- `.harness/state/feature_list.json` (F-066 package/acceptance amendment),
  `.harness/state/effects.json` (extend E-022; new effect for the `--mascot-*` +
  mood-contract → consumers).

**Package:**
- `packages/mascot/package.json`, `tsconfig.json`, `README.md` (contract docs) — pattern
  copied from `@tessera/billing`; devDeps add jsdom + @testing-library/react (dev-only).
- `packages/mascot/src/geometry.ts` — slot layout, tile constants (constant-derived, like
  the art suite).
- `packages/mascot/src/moods.ts` — the 10 mood records + `defineMood()` + validation.
- `packages/mascot/src/mascot.tsx` — the SVG rig component (`mood`, `size`, `interactive`,
  `title` props; SSR-deterministic: one markup shape, styling varies via `data-mood`).
- `packages/mascot/src/styles.css` — keyframes/transitions (transform/opacity only), the
  `--mascot-*` contract, `prefers-reduced-motion` block.
- `packages/mascot/src/index.ts` — public exports.
- `packages/mascot/test/*` — see test plan.
- `packages/mascot/scripts/render-masters.mjs` — deterministic generation of brand masters
  from mood data.
- `docs/design/brand/tessera-mascot.svg` + `tessera-mascot-moods.svg` — checked-in
  generated masters (single source of truth = mood data; drift-tested).
- Root workspace wiring: `pnpm-workspace.yaml` already globs `packages/*`; turbo picks up
  standard scripts.

**Marketing integrations:**
- `apps/marketing/package.json` — `@tessera/mascot` workspace dep.
- `apps/marketing/app/globals.css` — bind `--mascot-*` to Terra Mosaic tokens (dusk +
  noon), import package styles.
- `apps/marketing/components/site-nav.tsx` — mobile-menu ground placement (`greeting`,
  decorative).
- `apps/marketing/app/not-found.tsx` — NEW 404 page (`lost` mood, serif statement — e.g.
  "A tile is missing." — CTA home, archetype-conformant, both themes).
- `apps/marketing/components/art/constellation.tsx` (+ contract) — supervisor variant
  perched at the band edge, mood derived from `ConstellationTelemetry`, inside the
  existing lazy boundary.
- `apps/marketing/tests/design-lint.test.ts` fixtures via manifest only (fix code, never
  patterns); `tests/e2e/*` additions.

## Anticipated effects

- **E-022** (marketing design contract) gains: sanctioned Mascot component, accent-budget
  interaction, 404 archetype, mascot design-lint patterns.
- **New effect (E-02x):** `@tessera/mascot` mood contract + `--mascot-*` CSS variables →
  consumers (marketing menu/404/constellation supervisor; future `apps/web`, docs). A
  breaking change to slots/moods/variables must visit every consumer.
- Workspace graph: marketing now depends on `@tessera/mascot` (turbo build order).
- Brand assets: masters are generated — editing mood data regenerates
  `docs/design/brand/tessera-mascot*.svg` (drift test keeps them honest).

## Test plan

- **Package unit (vitest):** mood registry completeness (every mood × every slot + still
  pose); thermal-budget invariants (micro ≤250ms, one-shot ≤1.2s, ambient ≥9s loops);
  `defineMood()` validation (rejects incomplete/over-budget moods); geometry invariants
  (tiles within viewBox, heart present in every mood).
- **Package render/SSR (vitest + jsdom):** `renderToString` deterministic and identical
  regardless of any client state (the v4.5 hydration lesson, enforced structurally);
  decorative ⇒ `aria-hidden`; interactive ⇒ button + label; `data-mood` swaps.
- **Master drift test:** regenerating masters produces byte-identical checked-in SVGs.
- **Marketing design-lint:** usage budget (Mascot import `allowIn`: site-nav, not-found,
  constellation only — hero/pricing structurally banned); framer boundary still holds.
- **Marketing e2e (Playwright):** 404 route (correct status, one h1, axe AA both themes,
  375px no overflow); menu placement present + decorative semantics; supervisor present +
  text equivalent; reduced-motion = still poses, zero hydration errors on a fresh server.
- **Screenshots (MARKETING-DESIGN §8):** 3 surfaces × 2 themes × (motion + reduced),
  reviewed; brand-swap test re-run **with the mascot covered** (page still identifiably
  Tessera) and inverted (mascot alone still reads as Tessera).

## Verification

Standard gates: `typecheck`, `lint`, `test` (workspace — includes package + design-lint),
`e2e`, build green; first-load JS budget **unchanged ≤240KB gz** (mascot core target
≤6KB gz; supervisor rides the existing lazy constellation chunk); zero third-party
requests; axe AA both themes. Evidence per
[`../protocols/verification.md`](../protocols/verification.md).

## Increments (each verifiable, build stays green)

1. Governance: ADR-0046 + BRAND addendum + MARKETING-DESIGN/manifest bump + state files
   (`verify-state`, design-lint green).
2. Package scaffold + geometry + moods + static render (unit tests green).
3. Motion layer + interaction + reduced-motion (SSR/render tests green).
4. Master-generation script + checked-in brand SVGs (drift test).
5. Marketing binding (globals tokens + design-lint patterns) + mobile-menu placement
   (e2e + screenshots).
6. 404 page (e2e + axe + screenshots).
7. Constellation supervisor (e2e + budget evidence + screenshots).
8. Effect-trace, progress, checkpoint; commit per standing cadence.

## Risks / open questions

- ~~**OQ1 — Name.**~~ **Resolved:** **Tess** (stakeholder, 2026-07-11).
- ~~**OQ2 — Dashboard adoption scope.**~~ **Resolved:** package + marketing integrations
  only in F-066; **new backlog feature** for `apps/web` adoption (added as F-068,
  empty-state/error-surface placements under DESIGN-SYSTEM.md governance — the dashboard's
  monochrome token vocabulary needs its own binding decision there).
- ~~**OQ3 — Mood set size.**~~ **Resolved:** core 6 + 4 surface moods + `defineMood()`.
- **Risk — readability at 24px:** tile figure must stay legible small; mitigated by
  geometry unit test (minimum tile size at rendered scale) + screenshot review.
- **Risk — accent budget:** a gilded heart inside a band that already has an ember moment
  would break §7 budgets; mitigated by the ADR rule (mascot heart = the band's ember
  moment) enforced in review + design-lint where patterns allow.
- **Risk — constellation coupling:** supervisor consumes only the tiny
  `constellation-contract.ts`, never the engine, so first-load stays clean.
