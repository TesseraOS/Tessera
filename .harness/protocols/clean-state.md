# Protocol: Clean state

**Trigger:** the end of every session. Every session must leave a state a **fresh agent can
resume from files alone**.

## Checklist
1. **Coherent tree.** Either finish the increment to green, or stop at a clearly-bounded
   point. No half-applied multi-file edits left dangling.
2. **Progress recorded.** [`../state/progress.md`](../state/progress.md) has a new entry:
   date, feature, what changed, verification evidence, decisions, and the explicit
   **next step**.
3. **Status updated.** [`../state/feature_list.json`](../state/feature_list.json) reflects
   reality (`in_progress` / `in_review` / `done`); at most one `in_progress`.
4. **Effects current.** If a shared contract changed, [`effects.json`](../state/effects.json)
   is updated ([effect-link protocol](effect-link.md)).
5. **No cruft.** No secrets, debug prints, scratch files, or commented-out code committed
   to the working set.
6. **Reconcilable git.** `git status` matches what `progress.md` describes. (Commits only
   on user request — [commit policy](../governance/commit-policy.md).)
7. **State valid.** `node scripts/verify-state.mjs` passes.
8. **Lessons captured.** Reusable learnings recorded via
   [continuous-learning](../skills/continuous-learning/SKILL.md) into
   [`../memory/lessons/`](../memory/lessons/) (skip only if nothing reusable came up).

## The resumption test
Ask: *"If I lost all memory of this session right now, could I read the repo and continue
correctly?"* If no, you are not done cleaning up.
