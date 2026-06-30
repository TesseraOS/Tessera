# ADR-0021: Frontend execution harness, design-skill adaptation, and Astryx evaluation

- **Status:** Accepted
- **Date:** 2026-06-30
- **Deciders:** Project lead, Claude
- **Tags:** frontend, harness, design, tooling

## Context

R0's remaining work is the UI arc — **F-028** (UI foundation) then **F-014** (dashboard). The
frontend **stack and design system are already locked**
([ADR-0009](0009-frontend-stack-and-design-system.md),
[`DESIGN-SYSTEM.md`](../design/DESIGN-SYSTEM.md)), but the **frontend harness is missing**: there
are rules and a design spec, yet no UI-specific *skills*, no web *verification gates*, and no
machine-readable projection of the design system for agents to consume. The project lead asked
to build the harness **before** coding so it is actually used, and to evaluate three external
inputs:

1. **Meta Astryx** — open-sourced 2026-06-27 (MIT): a React design system on **StyleX** with a
   CLI + **MCP server + JSON manifest** ("agent-ready"), 150+ components, 10 themes. It can
   coexist with Tailwind (precompiled CSS + cascade layers, no build plugin), but its component
   layer would **replace shadcn/ui** and orphan the tweakcn token workflow.
2. The official **shadcn/ui** skill and **Anthropic `frontend-design`** skill.
3. The **taste** cluster — Leonxlnx `taste-skill`, Emil Kowalski's motion skill, `impeccable`.

## Decision

**1. Keep shadcn/ui; do not adopt Astryx now.** We ratify
[ADR-0009](0009-frontend-stack-and-design-system.md). Astryx is **three days old in public**;
betting R0's UI foundation on it conflicts with our "production-grade only / never break verified
code" bar, discards the locked tweakcn workflow and the curated reference set, and trades
owned-in-repo components for an external dependency. Astryx becomes an **R1 watch-item**,
revisitable via a superseding ADR once it has matured.

**2. Steal Astryx's best idea — a machine-readable design manifest.** We add
[`docs/design/design-system.manifest.json`](../design/design-system.manifest.json): a faithful
projection of `DESIGN-SYSTEM.md` (token roles, themes, component inventory, motion params, UX
baseline, a11y + performance budgets) that the harness/skills consume. `DESIGN-SYSTEM.md` stays
the human source of truth; the manifest is its machine projection. Concrete token *values* are
filled by F-028 (tweakcn export).

**3. Adapt four external design skills into the harness** (canonical `.harness/skills/` + Claude
shims), **subordinate to `DESIGN-SYSTEM.md`**, with NOTICE.md attribution — the same pattern as
[ADR-0013](0013-general-purpose-execution-skills-from-ecc.md):
- **`build-ui`** — UI feature orchestrator (server-first, tokens, compose, UX baseline,
  provenance, a11y).
- **`shadcn`** — find/install/compose/customize shadcn (from the official shadcn skill, MIT).
- **`frontend-craft`** — typography/spacing/restraint/anti-slop (from `frontend-design`,
  Apache-2.0, and `taste-skill`, MIT) — explicitly capped by "restraint over richness".
- **`motion`** — functional motion (from Emil Kowalski's skill, MIT).

**4. Register web verification gates** in
[`gates.json`](../../.harness/verification/gates.json): `a11y` (axe / WCAG 2.1 AA) and `web-perf`
(bundle/perf budget), **status `planned`**, activating when F-028 lands (mirroring how `e2e`
activated with F-011).

## Consequences

### Positive
- One coherent design authority (DESIGN-SYSTEM.md) with skills that operationalize it, not five
  competing community skills.
- The design system becomes agent-consumable (the manifest) — on-brand for a Context OS for
  agents — without a risky framework swap.
- No churn to the locked stack; F-028/F-014 start on a ready harness.

### Negative / Costs
- We forgo Astryx's 150+ ready components/templates (more hand-composition with shadcn).
- The manifest is a second artifact to keep in sync with DESIGN-SYSTEM.md (mitigated: the
  manifest is a projection, reviewed together).

### Neutral / Follow-ups
- **Revisit Astryx at R1** via a superseding ADR if it proves out (maturity, stability, theming
  fit). Tracked as a watch-item in the manifest.
- The `a11y`/`web-perf` gate commands are finalized when F-028 stands up `apps/web`.
- Recorded as harness feature **F-033**; attributions in [`NOTICE.md`](../../NOTICE.md).

## Alternatives considered

- **Adopt Astryx as the foundation now** — rejected: a 3-day-old public release vs a
  production-grade bar; supersedes a sound recent ADR; drops owned-in-repo control and the
  tweakcn/efferd/coss reference alignment.
- **Raw-install the external skills (`npx skills add`) into `.claude/`** — rejected: violates the
  "harness is canonical" model, risks contradicting DESIGN-SYSTEM.md, and invites skill sprawl.
  We adapt and subordinate instead.
- **No frontend skills (rely on rules + spec only)** — rejected: the lead asked for a harness
  that is actually used; skills make the design system executable for agents.

## References

- [ADR-0009](0009-frontend-stack-and-design-system.md) (ratified),
  [ADR-0013](0013-general-purpose-execution-skills-from-ecc.md) (skill-adaptation pattern),
  [`DESIGN-SYSTEM.md`](../design/DESIGN-SYSTEM.md),
  [`design-system.manifest.json`](../design/design-system.manifest.json), `docs/PRD.md` (FR-49,
  NFR-9).
- Astryx: <https://astryx.atmeta.com/> · <https://github.com/facebook/astryx> (MIT, 2026-06-27).
- Skills: shadcn/ui (MIT), anthropics/skills `frontend-design` (Apache-2.0),
  Leonxlnx/taste-skill (MIT), emilkowalski/skill (MIT).
