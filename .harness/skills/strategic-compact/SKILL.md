---
name: strategic-compact
description: Compact the context window deliberately at task boundaries (not arbitrarily) so long sessions stay coherent and nothing important is lost.
---

# Skill: strategic-compact

Long agent sessions degrade when the context window fills with stale exploration, error
traces, and completed-phase chatter — or when auto-compaction fires mid-task and drops
something you needed. Compact **deliberately at natural boundaries** instead.

> Adapted (MIT) from ECC `strategic-compact` (© Affaan Mustafa) — see [`NOTICE.md`](../../../NOTICE.md).
> This reinforces our golden rule that **the repository is the system of record**: anything
> that must survive a compaction already lives in files, not the conversation.

## Compact at these boundaries
| Transition in our loop | Compact? | Why |
|------------------------|:--------:|-----|
| research/explore → **plan** | **Yes** | keep the distilled plan, drop raw exploration |
| plan → **implement** | **Yes** | the plan persists in [`../../plans/`](../../plans/); free context for code |
| after a **failed approach** | **Yes** | reset reasoning before a new strategy |
| feature done → **next feature** | **Yes** | clear the finished feature's traces |
| **mid-implementation** | **No** | preserve variable names, partial edits, live reasoning |

## Before you compact (the safety check)
Compaction is safe **only if state is already in files**. Confirm:
- `progress.md` has the current status + next step ([clean-state](../../protocols/clean-state.md)).
- The active feature + status are in [`feature_list.json`](../../state/feature_list.json).
- Any decision is in an [ADR](../write-adr/SKILL.md); any reusable lesson is captured
  ([continuous-learning](../continuous-learning/SKILL.md)).
- Shared-contract changes are in [`effects.json`](../../state/effects.json).

If all true, compact (e.g. Claude Code `/compact`). What survives: files, memory, git state.
What's lost: conversation history + intermediate reasoning — which is why we wrote it down.

## Signals it's time
Rising context usage or a long run of tool calls since the last boundary. Don't wait for an
automatic trigger to interrupt you mid-edit — pre-empt it at the next clean boundary.

> Future enhancement (deferred): an optional Claude Code `PreToolUse` hook could *suggest*
> compaction at thresholds. We use the manual discipline above first (no fragile auto-scripts).
