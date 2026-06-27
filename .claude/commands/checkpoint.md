---
description: Record progress and leave a clean, resumable state (does not commit).
---

Follow the canonical command at `.harness/commands/checkpoint.md` and the protocol at
`.harness/protocols/clean-state.md`.

Bring the tree to a coherent state; update `.harness/state/progress.md` (what changed,
evidence, decisions, next step) and feature statuses in
`.harness/state/feature_list.json`; run effect-tracing if a shared contract changed;
confirm no secrets/cruft and that `git status` matches the log; then
`node scripts/verify-state.mjs`.

This does NOT commit — commits happen only when the user asks
(`.harness/governance/commit-policy.md`).
