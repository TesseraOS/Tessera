---
description: Run Tessera's verification gates and capture evidence.
---

Follow the canonical command at `.harness/commands/verify.md` and the protocol at
`.harness/protocols/verification.md`.

Run, in order, the gates in `.harness/verification/gates.json` that are not
`pending-toolchain` (currently: `node scripts/verify-state.mjs`; the rest activate when the
toolchain lands). Stop at the first failure and fix the root cause — never skip or weaken a
gate. Record commands + results in `.harness/state/progress.md`. Prefer running this as the
`evaluator` subagent for independence.
