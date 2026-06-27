# Command: checkpoint

Record progress and leave a clean, resumable state. Wrapper over the
[clean-state protocol](../protocols/clean-state.md).

## Procedure
1. Bring the working tree to a coherent state: either a green increment, or a clearly
   recorded half-done state with resume instructions.
2. Update [`../state/progress.md`](../state/progress.md): what changed, verification
   evidence, decisions made, **next step**.
3. Update [`../state/feature_list.json`](../state/feature_list.json) statuses.
4. Run effect-tracing if a shared contract changed
   ([`effect-trace`](../skills/effect-trace/SKILL.md)).
5. Confirm no secrets, no debug cruft, no half-applied edits; `git status` matches what
   `progress.md` says.
6. `node scripts/verify-state.mjs` to confirm state files are valid.

## Note
This does **not** commit. Commits happen only when the user asks
([commit policy](../governance/commit-policy.md)).
