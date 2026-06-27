# Instruction: Session lifecycle

A "session" is one continuous working span by an agent. Long-running tasks lose continuity
unless every session opens and closes deterministically against files.

## Start of session
1. Run the [initialization protocol](../protocols/initialization.md).
2. Read the **last 1–3 entries** of [`progress.md`](../state/progress.md) to learn where
   the previous session stopped and any open threads.
3. Confirm there is at most **one** `in_progress` feature in
   [`feature_list.json`](../state/feature_list.json). If one exists, resume it; do not
   start another.
4. Verify a clean baseline: `git status` should match what `progress.md` says it should be.
   If it doesn't, reconcile before doing new work.

## During the session
- Keep the build green; commit-worthy state only.
- If you discover work outside the current feature's scope, **record it** as a new
  `backlog` feature or a follow-up note — do **not** silently expand scope.
- Update `progress.md` incrementally for anything a future session would need to know
  (decisions, dead-ends, partial state).

## End of session (always)
Run the [clean-state protocol](../protocols/clean-state.md):
1. Either finish the increment to a green, coherent state, **or** record exactly what is
   half-done and how to resume.
2. Update `progress.md` with: what changed, verification evidence, decisions, next step.
3. Update `feature_list.json` statuses.
4. Ensure no stray/half-applied edits, no secrets, no debug cruft.
5. Leave `git status` in the state your `progress.md` describes.

> The test of a good session close: **a fresh agent, with zero memory of this session,
> can read the files and continue correctly.**
