---
name: design-review
description: Audit a built or changed screen against deterministic design anti-patterns and DESIGN-SYSTEM.md before declaring UI work done — a critique/polish pass, subordinate to our design system.
---

# Skill: design-review

Turn "it renders" into "it's right." Use **after** [`build-ui`](../build-ui/SKILL.md) produces a
screen and **before** the UI is declared done: an independent design audit against concrete
anti-patterns, then a restraint-first polish. Complements
[`frontend-craft`](../frontend-craft/SKILL.md) (build-time taste) and feeds the `a11y` /
`web-perf` gates.

> Adapted (Apache-2.0) from **`impeccable`** (© pbakaus) — its audit/critique workflow and
> deterministic anti-pattern detectors — see [`NOTICE.md`](../../../NOTICE.md). We adapt the
> *review discipline* into the agnostic harness; impeccable's full CLI, 45-rule detector, and
> browser extension remain upstream if we later want automated tooling. Adoption decision:
> [ADR-0038](../../../docs/adr/0038-external-agent-skill-adaptations-design-review-and-skill-observer.md).

> **Subordinate to our system.** Where any heuristic here conflicts with
> [`DESIGN-SYSTEM.md`](../../../docs/design/DESIGN-SYSTEM.md) or its manifest, **our design
> system wins** — our tokens, elevation set, z-index scale, radius, and motion params. Principle
> #1 stays **restraint over richness**: this audit removes slop; it never licenses decoration.
> For `apps/marketing` the binding authority is
> [`MARKETING-DESIGN.md`](../../../docs/design/MARKETING-DESIGN.md) (ADR-0042) — run these
> detectors on top of it (note its scoped allowances: the hero eyebrow, `steps` numbering).

## Workflow (verb-driven)
Pick the pass you need; run them in order for a full review:
1. **audit** — scan the screen against the *anti-pattern detectors* below; list each hit as
   `file:line` with the token/rule it violates.
2. **critique** — structured design critique: is the hierarchy obvious at a glance, is the rhythm
   consistent, does every element earn its place; name the single primary action per view.
3. **polish / quieter / distill** — apply the *smallest* changes that resolve the audit hits
   toward clarity and restraint (remove, don't add).
4. **live** — verify in the browser with the `preview_*` tools (snapshot / inspect / screenshot;
   `preview_resize` for responsive + dark mode). Prove the fix with evidence, don't assert it.

## Anti-pattern detectors (deterministic — match and fix)
Flag and remove on sight; each maps back to a DESIGN-SYSTEM.md token or rule:
- **Side-stripe accents** — colored left/right borders wider than a hairline used as decoration.
- **Gradient text** (`background-clip: text`), and gratuitous gradients / glassmorphism as
  default decoration — use the fixed elevation and surface set instead.
- **Hero-metric template** — a big number + gradient accent standing in for real hierarchy.
- **Identical card grids** repeated endlessly; **nested cards**; **over-rounded** cards beyond the
  radius token.
- **Eyebrow labels above every section**, and **numbered section markers** (`01 / 02 / 03`) used
  as default scaffolding.
- **Ghost cards** — a 1px border plus a wide soft shadow (a common machine-generated tell).
- **Text overflow / truncation** at any breakpoint.
- **Off-token values** — any color, spacing, radius, shadow, or z-index not drawn from the design
  system. Build a semantic z-index from the scale; never use arbitrary values.

## Design-principle checks
- **Color & contrast:** color carries meaning, not decoration. Body text ≥ 4.5:1; no gray text on
  colored fills (darken the fill's own hue). Categorical data uses `--chart-*`.
- **Typography:** body measure ~65–75ch; hierarchy from size / weight / line-height (not color);
  `text-wrap: balance` on headings, `text-wrap: pretty` on prose; keep to the type scale — no
  invented sizes.
- **Layout & rhythm:** a consistent 4px spacing rhythm; flexbox for 1D, grid for 2D; whitespace is
  a feature, not waste.
- **Motion:** intentional and rare; ease-out; **`prefers-reduced-motion` support is mandatory**;
  no layout-property or image-on-hover animation. Defer to [`motion`](../motion/SKILL.md).

## The "AI-slop" test (two altitudes)
1. Could the palette / theme be guessed from the product category alone? 2. Is the aesthetic
family still obvious even after removing the obvious anti-references? If either is "yes," rework —
a correct-but-generic screen is not done.

## Done when
Zero unresolved anti-pattern hits · every value on-token · the critique's primary action is
unmistakable · `a11y` and `web-perf` gates green *with evidence* (see
[`verify-gate`](../verify-gate/SKILL.md)).
