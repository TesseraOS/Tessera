# ADR-0038: Adopt design-review (impeccable) and skill-observer (one-skill); decline pm-skills

- **Status:** Accepted
- **Date:** 2026-07-04
- **Deciders:** Project lead, Claude
- **Tags:** harness, skills, design, learning, governance

## Context

Four external agent-skill repositories were proposed for the harness:

1. **pbakaus/impeccable** (Apache-2.0) — a design-quality system: an audit / critique / polish
   workflow plus ~45 deterministic anti-pattern detectors and live-browser iteration.
2. **rebelytics/one-skill-to-rule-them-all** (CC BY 4.0) — "Task Observer," a meta-skill that
   watches sessions, captures corrections, and drafts skill/library improvements.
3. **phuryn/pm-skills** (MIT) — a marketplace of 9 product-management plugins / ~68 skills
   (discovery, GTM, marketing, battlecards, résumé review, …).
4. **openai/codex-plugin-cc** (Apache-2.0) — a Claude Code plugin delegating review / "rescue" to
   OpenAI Codex (covered separately by [ADR-0039](0039-optional-independent-model-adversarial-review-codex.md)).

The project lead chose to **adapt into the agnostic `.harness/`** (not raw-install), the same
pattern as [ADR-0013](0013-general-purpose-execution-skills-from-ecc.md) (ECC) and
[ADR-0021](0021-frontend-harness-and-design-skill-adaptation.md) (frontend design skills), and
delegated the scope calls for pm-skills and codex. impeccable was already evaluated in ADR-0021's
"taste cluster" and credited in `frontend-craft`; this ADR takes the fuller step of adapting its
*audit workflow*.

## Decision

**1. Adopt `design-review`** — a new canonical skill
([`.harness/skills/design-review/SKILL.md`](../../.harness/skills/design-review/SKILL.md)) that
adapts impeccable's audit/critique/polish workflow and its deterministic anti-pattern detectors,
**subordinate to** [`DESIGN-SYSTEM.md`](../design/DESIGN-SYSTEM.md). It complements
`frontend-craft` (build-time taste) and `build-ui` (orchestrator), runs its live checks through
our own `preview_*` tooling, and feeds the `a11y` / `web-perf` gates. We adapt the *review
discipline* (principles); impeccable's full CLI, 45-rule detector, and browser extension stay
upstream if we later want automated tooling.

**2. Adopt `skill-observer`** — a new canonical skill
([`.harness/skills/skill-observer/SKILL.md`](../../.harness/skills/skill-observer/SKILL.md)) that
adapts the Task Observer methodology: a low-friction observation buffer
([`.harness/memory/observations.md`](../../.harness/memory/observations.md)) capturing
Issue / Suggested-improvement / Principle notes, drained on a periodic review into concrete
skill / rule / ADR improvements. It has a crisp boundary versus `continuous-learning` (durable
lessons — *what happened*) and `write-adr` (decisions).

**3. Decline `pm-skills`.** Its ~68 PM skills are off-mission for a coding/build harness; product
definition already lives in [`docs/PRD.md`](../PRD.md), the roadmap, and the ADRs. Adopting it
would be scope creep against golden rule #2 and would dilute a focused harness. Revisit only if a
specific, non-overlapping PM workflow is genuinely needed.

**4. Attribution + shims.** Add NOTICE.md entries (Apache-2.0 for impeccable; CC BY 4.0 for Task
Observer, with attribution retained as the license requires); add thin `.claude/` shims for both
new skills; update the skills index.

## Consequences

### Positive
- A concrete design-audit discipline and a self-improvement loop, both in the agnostic core and
  both subordinate to existing authorities (DESIGN-SYSTEM.md; continuous-learning / write-adr).
- No new runtime dependencies; additive Markdown only — the build stays green.
- Fixes a pre-existing index gap (the frontend skills were not listed in the skills README).

### Negative / Costs
- `design-review` adapts principles, not impeccable's automated 45-rule detector — the audit is
  manual until/unless we adopt the upstream tooling.
- The observation buffer must actually be reviewed or it rots (mitigated: review is a task-boundary
  step held to signal-over-noise).

### Neutral / Follow-ups
- Recorded in [`progress.md`](../../.harness/state/progress.md) and a memory decision entry. No
  `feature_list.json` item — this is harness meta-work, like ADR-0013 / ADR-0021.

## Alternatives considered

- **Raw-install all four via plugin marketplaces** — rejected: violates the "harness is canonical /
  agnostic core" model, risks contradicting DESIGN-SYSTEM.md, and invites skill sprawl plus
  external dependencies. We adapt and subordinate instead.
- **Adopt pm-skills (full or cherry-picked)** — rejected: overlaps existing product docs and
  verification; the in-scope slivers (PRD/OKR authoring, an AI-shipping audit) duplicate what the
  harness already owns.
- **Fold `skill-observer` into `continuous-learning`** — rejected: distinct charter (improve the
  *system* vs record *history*); a crisp boundary plus cross-links is clearer than one overloaded
  skill.

## References

- Related: [ADR-0013](0013-general-purpose-execution-skills-from-ecc.md),
  [ADR-0021](0021-frontend-harness-and-design-skill-adaptation.md),
  [ADR-0039](0039-optional-independent-model-adversarial-review-codex.md).
- Skills: [`design-review`](../../.harness/skills/design-review/SKILL.md),
  [`skill-observer`](../../.harness/skills/skill-observer/SKILL.md). Attribution:
  [`NOTICE.md`](../../NOTICE.md).
- Sources: impeccable <https://github.com/pbakaus/impeccable> (Apache-2.0);
  one-skill-to-rule-them-all <https://github.com/rebelytics/one-skill-to-rule-them-all>
  (CC BY 4.0); pm-skills <https://github.com/phuryn/pm-skills> (MIT).
