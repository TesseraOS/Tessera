# Instruction: The working loop

The canonical loop for every unit of work. Summarized in
[`../../AGENTS.md` §2](../../AGENTS.md); this is the detailed version.

```
initialize → select feature → plan → implement → verify → trace effects → record → clean
```

## 1. Initialize
Run the [initialization protocol](../protocols/initialization.md). Load: `AGENTS.md`, the
active/next feature from [`feature_list.json`](../state/feature_list.json), the last few
entries of [`progress.md`](../state/progress.md), the [rules](../rules/) relevant to the
files you will touch, and any related [memory](../memory/). Confirm the toolchain is
healthy (`scripts/init.*`).

## 2. Select feature
Exactly one. Pick the lowest-id eligible feature for the current release whose
`blockedBy` are all `done`. Set its `status` to `in_progress` (respect `wip_limit: 1`).
Do not expand scope beyond its `acceptance` list. Helper:
[`/next-feature`](../commands/next-feature.md).

## 3. Plan
Write a short plan to [`../plans/`](../plans/) using [`TEMPLATE.md`](../plans/TEMPLATE.md):
intent, files to touch, approach, **anticipated effects**, and how you will verify. For a
non-trivial feature, use the **planner** subagent (`../../.claude/agents/planner.md`) and
keep planning separate from implementation.

## 4. Implement
Follow [`add-feature`](../skills/add-feature/SKILL.md) and the [rules](../rules/). Work in
**small, individually-verifiable increments**. Keep the build green continuously. Prefer
reusing existing ports/utilities over inventing new ones. No unrelated refactors.

## 5. Verify
Run the [verification protocol](../protocols/verification.md) via
[`/verify`](../commands/verify.md). **Only a passing run with evidence counts.** If a gate
fails, fix the cause — never weaken the gate to pass.

## 6. Trace effects
Run the [effect-link protocol](../protocols/effect-link.md): identify what this change
affects, update [`effects.json`](../state/effects.json), and address (or file as
follow-up) every surfaced dependent.

## 7. Record
Update [`progress.md`](../state/progress.md) (what changed, evidence, decisions) and
`feature_list.json` (`status`, notes). Capture reusable lessons to
[`../memory/lessons/`](../memory/lessons/). New decision → [ADR](../skills/write-adr/SKILL.md).

## 8. Clean
Run the [clean-state protocol](../protocols/clean-state.md) via
[`/checkpoint`](../commands/checkpoint.md). The next session must be able to resume from
files alone.
