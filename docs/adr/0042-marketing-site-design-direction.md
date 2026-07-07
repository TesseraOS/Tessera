# ADR-0042: Marketing site design direction — dark-only, monochrome + emerald, gate-enforced design system

- **Status:** Accepted — **visual parameters amended by [ADR-0043](0043-terra-mosaic-brand-and-marketing-overhaul.md)** (the enforcement mechanism decided here stands; the dark-only/emerald/CSS-only-motion parameters were superseded after stakeholder review)
- **Date:** 2026-07-07
- **Deciders:** Project lead + F-051 session
- **Tags:** frontend, design, marketing, harness

## Context

F-051 builds `apps/marketing` — Tessera's first impression. Two forces shape this decision:

1. The existing design authority ([`DESIGN-SYSTEM.md`](../design/DESIGN-SYSTEM.md),
   ADR-0023) is **dashboard-scoped**: it binds an app shell (sidebar, stat cards, charts)
   to the efferd Dashboard 3 reference. It under-constrains long-form marketing pages —
   heroes, feature narratives, pricing — leaving open exactly the space where
   agent-generated UI reliably degrades into generic "AI slop" (gradient text, purple
   templates, fabricated social proof, inconsistent scale).
2. Project experience: dashboard UI produced without a strict, deterministic contract
   required manual rework. The project lead's directive for the marketing surface is an
   unmistakably polished, enterprise-grade first impression **and** a harness strict enough
   that any future agent session lands inside it.

The positioning reference is unabyss.com (dark, minimal, golden accent, integrations wall)
— which Tessera intends to exceed (ADR-0035).

## Decision

Adopt [`docs/design/MARKETING-DESIGN.md`](../design/MARKETING-DESIGN.md) (+ machine-readable
[`marketing-design.manifest.json`](../design/marketing-design.manifest.json)) as the
**binding design system for `apps/marketing`** (and later the public chrome of `apps/docs`).
Key locked parameters:

1. **Dark-only v1.** Near-black `#030303` canvas, no light theme, no toggle. This is a
   deliberate, scoped deviation from the dashboard's light/dark/system rule: it halves the
   design/QA surface, guarantees the intended first impression, and matches the
   premium dev-tool genre. Revisit trigger: post-launch demand or measurable bounce
   attributable to forced dark.
2. **Monochrome + one accent: emerald `#34d399`,** budgeted (≤ 2 accent elements per
   viewport; never large fills). Rationale: brand-coherent (emerald is the dashboard's only
   functional hue), differentiated from unabyss's gold and from the indigo/violet AI-slop
   default. The primary CTA is near-white on black — the accent marks insight, not chrome.
3. **Typography-led, closed type scale.** Geist Sans/Mono (already the product's faces);
   seven named text styles are the *only* sizes on the site; sentence case everywhere.
4. **Signature visual: the tessera mosaic** — scattered fragments assembling into a
   compiled core (the logo's narrative; product-true for the Context Compiler). DOM/SVG on
   tokens; no stock art, no 3D, no particles.
5. **CSS-only motion in v1** — no framer-motion dependency in this app; entrance/hover
   transitions only; `prefers-reduced-motion` global kill-switch; the LCP element is never
   animated from invisible.
6. **Honest content as a hard rule** — no fabricated logos/testimonials/metrics; pricing
   renders from `@tessera/billing` PLANS; integrations as typographic wordmarks.
7. **Gate-level enforcement.** The manifest carries `bannedPatterns`/`requiredPatterns`
   (regexes) that a **design-lint vitest suite in `apps/marketing` compiles and runs inside
   the standard `test` gate** — gradient utilities, raw palette classes, arbitrary bracket
   values, shadows, hype vocabulary, hardcoded domains, etc. fail the build. Taste is
   encoded as a contract, not asserted in review prose.

The harness realization: rule [`.harness/rules/frontend/marketing.md`](../../.harness/rules/frontend/marketing.md),
skill [`.harness/skills/marketing-ui/SKILL.md`](../../.harness/skills/marketing-ui/SKILL.md),
service manual `apps/marketing/AGENTS.md`.

## Consequences

### Positive
- Any agent (or human) working on marketing pages inherits an executable definition of
  "good" — violations are build failures, not opinions discovered in review.
- Brand coherence across surfaces (same mark, same mono/emerald language as the dashboard)
  with a rendering profile fit for SEO/CWV (static, zero client data fetching).
- The manifest gives future tooling (design MCP, CI reporters) a stable contract.

### Negative / Costs
- Dark-only excludes light-preference visitors in v1 (mitigated: AA-verified contrast;
  revisit trigger recorded).
- A closed type/token set occasionally forces a manifest edit where a one-off utility would
  have been faster — this friction is the point (deliberate, reviewed evolution).
- Two design documents now exist (dashboard + marketing); shared-principle drift is
  possible. Mitigation: MARKETING-DESIGN.md §0 declares precedence and shared principles;
  token *structure* stays identical.

### Neutral / Follow-ups
- A shared token *package* is still deferred until real duplication hurts (ADR-0035).
- `web-perf` gate activation stays with F-049; until then `next build` route output is the
  recorded evidence.
- If a light theme is later demanded, it lands as a full token set + screenshot re-review,
  not a quick toggle.

## Alternatives considered

- **Reuse the dashboard design system as-is** — rejected: app-shell idioms (sidebar,
  stat cards) don't compose marketing pages; the gap invites improvisation.
- **Light-first marketing (Stripe-style)** — rejected for v1: weaker continuity with the
  dark dashboard, larger QA surface, and the dev-tool audience's genre expectation is dark.
- **A second brand hue (gold/indigo/violet)** — rejected: gold collides with the unabyss
  reference; indigo/violet is the AI-template default the direction explicitly avoids;
  emerald already carries meaning in-product.
- **Framer Motion for hero theatrics** — rejected v1: cost (bundle, LCP risk, reduced-motion
  complexity) exceeds value for a static page; CSS covers the approved motion set.
- **Prose-only guidelines (no gate)** — rejected: this is the failure mode being fixed;
  unenforced taste does not survive session boundaries.

## References

- ADR-0035 (three surfaces), ADR-0036 (agent-first ops), ADR-0023 (dashboard reference),
  ADR-0009 (frontend stack); PRD FR-67, NFR-17; `docs/design/MARKETING-DESIGN.md`;
  `docs/design/marketing-design.manifest.json`; plan `.harness/plans/F-051-marketing-site.md`.
