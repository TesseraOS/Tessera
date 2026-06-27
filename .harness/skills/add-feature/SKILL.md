---
name: add-feature
description: Implement the next Tessera feature end-to-end, one at a time, with verification and effect-tracing.
---

# Skill: add-feature

The canonical procedure for building one feature. Enforces one-feature-at-a-time, plan→
implement→verify, and clean recording.

## Preconditions
- You ran the [initialization protocol](../../protocols/initialization.md).
- There is **no** other `in_progress` feature (`wip_limit: 1`).

## Steps

1. **Claim the feature.** In [`feature_list.json`](../../state/feature_list.json) pick the
   lowest-id eligible feature for the current release with all `blockedBy` `done`. Set
   `status: in_progress`. (Helper: [`/next-feature`](../../commands/next-feature.md).)

2. **Understand scope.** Read its `requirements` (FR-*/NFR-*) in
   [`docs/PRD.md`](../../../docs/PRD.md), relevant [ADRs](../../../docs/adr), and the
   [architecture](../../../docs/architecture/ARCHITECTURE.md) sections it touches. The
   `acceptance` list is the contract — nothing more, nothing less.

3. **Plan.** Write a plan in [`../../plans/`](../../plans/) from
   [`TEMPLATE.md`](../../plans/TEMPLATE.md): files to touch, approach, **anticipated
   effects**, test plan, verification. For non-trivial work, use the **planner** subagent
   and keep it separate from implementation.

4. **Implement in small increments.** Follow the [rules](../../rules/). Reuse existing
   ports/utilities. Write tests alongside (or first). Keep typecheck/lint/tests green
   between increments. No unrelated refactors.

5. **Verify.** Run [`verify-gate`](../verify-gate/SKILL.md). Only a passing run with
   captured evidence counts. Fix causes, never weaken gates.

6. **Trace effects.** Run [`effect-trace`](../effect-trace/SKILL.md); update
   [`effects.json`](../../state/effects.json) and handle/record every dependent.

7. **Record & close.** Update [`progress.md`](../../state/progress.md) (changes, evidence,
   decisions), set the feature `done` (or `in_review`), capture lessons to
   [`../../memory/lessons/`](../../memory/lessons/), update docs/ADRs if affected, then run
   the [clean-state protocol](../../protocols/clean-state.md).

## Definition of done
The feature is done only when [definition-of-done](../../protocols/definition-of-done.md)
is fully satisfied. If any item fails, the feature stays `in_progress`.
