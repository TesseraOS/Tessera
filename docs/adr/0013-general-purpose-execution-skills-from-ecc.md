# ADR-0013: Adopt general-purpose execution skills (adapted from ECC)

- **Status:** Accepted
- **Date:** 2026-06-28
- **Deciders:** Project lead, Claude
- **Tags:** harness, skills, tooling
- **Note:** ADR-0012 is retired (it recorded the agy worker, since removed — see git history).

## Context

The harness had strong **project** rules/skills/protocols but no **general-purpose execution
skills** — the model-level "how to work well" layer that improves quality and reliability on
*any* task. Capable models still execute unreliably without this layer (lost context, repeated
mistakes, inconsistent standards). The project lead asked for a general-purpose layer **from the
start** and pointed to **ECC** ("Everything Claude Code", <https://github.com/affaan-m/ECC>,
**MIT**, © Affaan Mustafa) as a proven reference, naming `coding-standards`,
`continuous-learning`, and `strategic-compact`.

## Decision

Adopt a curated set of **general-purpose execution skills**, **adapted** from ECC (not copied)
and tailored to Tessera, with **MIT attribution** in [`NOTICE.md`](../../NOTICE.md):

- [`strategic-compact`](../../.harness/skills/strategic-compact/SKILL.md) — compact context
  deliberately at phase boundaries (never mid-implementation).
- [`continuous-learning`](../../.harness/skills/continuous-learning/SKILL.md) — extract reusable
  lessons into the **in-repo** [`.harness/memory/lessons/`](../../.harness/memory/lessons/)
  (key adaptation: our system of record, not a personal `~/.claude` store).
- [`coding-standards`](../../.harness/skills/coding-standards/SKILL.md) — a thin skill indexing
  our [`rules/`](../../.harness/rules/), which were enriched with the concrete baseline
  (KISS/DRY/YAGNI, small functions, no magic numbers, parallel async, AAA tests).

**Integration over automation:** the skills are **wired into existing protocols** (workflow,
session-lifecycle, clean-state, definition-of-done) so they're part of the mandatory loop —
reliable and cross-platform. **Executable Claude Code hooks are deferred** (the ECC versions
read session transcripts / run on every tool-call or session-end; that's OS-fragile on Windows
and more to maintain). Hooks remain an optional future enhancement.

**Scope:** only these three skills now. ECC's broader general-purpose **agents/commands**
(e.g. code-reviewer, security-reviewer) are **not** adopted yet — we add them **as we code**,
consulting ECC for proven patterns and adapting with attribution (see the
[`ecc-harness-reference`] memory).

## Consequences

### Positive
- A quality/execution layer present before heavy coding; consistent standards; less context loss
  and fewer repeated mistakes.
- Tool-agnostic (works for any agent), reliable because enforced by protocols, not fragile scripts.

### Negative / Costs
- Manual discipline (vs full automation) until/unless hooks are added.
- We must retain MIT attribution and keep our adaptations in sync with our own conventions.

### Neutral / Follow-ups
- Consider optional Claude Code hooks (suggest-compact, lesson-capture) once a cross-platform
  helper is proven.
- Add general-purpose reviewer agents/commands incrementally as coding proceeds (refer to ECC).

## Alternatives considered

- **Copy ECC wholesale** — rejected: fit, maintenance, and clarity; we adapt a curated subset.
- **Add executable hooks now** — rejected: Windows fragility + upkeep before the value is felt.
- **Skip general-purpose skills** — rejected: that's the gap the lead correctly flagged.

## References

- [`NOTICE.md`](../../NOTICE.md), the three skills above, `.harness/rules/common/engineering.md`,
  and the `ecc-harness-reference` memory.
