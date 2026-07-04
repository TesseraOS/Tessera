---
name: skill-observer
description: Silently capture friction, corrections, and repeating patterns during work into an observation buffer, then periodically turn them into concrete skill/rule/ADR improvements — the harness improving itself.
---

# Skill: skill-observer

The meta-skill that improves the harness itself. While you work, notice what the harness *should*
have done differently and capture it; on a periodic review, convert those observations into
concrete improvements to skills, rules, and protocols.

> Adapted (CC BY 4.0) from **"One Skill to Rule Them All" / Task Observer** (© Eoghan Henn,
> rebelytics.com) — see [`NOTICE.md`](../../../NOTICE.md). Attribution is required by the license
> and retained there. **Key adaptation:** observations and improvements land in the **in-repo
> system of record** (memory, skills, rules, ADRs), not a personal store. Adoption decision:
> [ADR-0038](../../../docs/adr/0038-external-agent-skill-adaptations-design-review-and-skill-observer.md).

## Boundary (what this is / isn't)
- **skill-observer** improves *the system* — it proposes edits to the [skills](../README.md),
  [`rules/`](../../rules/), and [`protocols/`](../../protocols/).
- [`continuous-learning`](../continuous-learning/SKILL.md) records *what happened* — durable
  lessons in [`memory/lessons/`](../../memory/lessons/). Observer routes "what happened" there.
- [`write-adr`](../write-adr/SKILL.md) records *decisions*. Observer routes substantial or
  default-deviating changes there. Memory records history; rules/ADRs change what we do.

## Capture (during work, low-friction)
When you hit friction, get corrected, repeat a multi-step routine, or find a heuristic that
worked unusually well, append one entry to the observation buffer
[`../../memory/observations.md`](../../memory/observations.md) — three parts:
- **Issue** — what actually happened (with a pointer: file, skill, or rule).
- **Suggested improvement** — the smallest concrete change.
- **Principle** — the generalizable reason it matters beyond this one instance.

Capture, don't fix mid-task — stay on the claimed feature (golden rule #2). One line each; the
**Principle** is what turns a one-off correction into reusable knowledge.

## Review (periodic — at a task boundary or on request)
1. Read the open observations; cross-check each against the actual skill/rule library.
2. **Small & clearly additive** (a missing checklist item, a sharpened rule) → apply the edit
   directly to that skill/rule and mark the entry `applied`.
3. **Substantial or new-skill-worthy** → route to [`write-adr`](../write-adr/SKILL.md), and for a
   new skill follow the skill-creator discipline; don't inline a large change.
4. **Simplification signals** count too — a section never used, an elaborate step consistently
   shortcut, a rule contradicted in practice → prune, don't only add.
5. The human decides which to pursue; resolved entries are struck through or removed so nothing is
   lost between sessions.

## Signal over noise
Capture reusable friction, not trivia. A few durable improvements beat a long log — the same
discipline as [`continuous-learning`](../continuous-learning/SKILL.md), applied to the harness
itself.

> **Trigger (optional):** for consistent activation across context compaction, a project may add a
> structural trigger to AGENTS.md / CLAUDE.md. We do **not** wire an always-on LLM hook (matching
> continuous-learning's stance) — capture is a deliberate step at friction points and task
> boundaries.
