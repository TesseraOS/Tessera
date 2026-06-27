# Command: verify

Run the verification gates and capture evidence. Thin wrapper over the
[`verify-gate`](../skills/verify-gate/SKILL.md) skill and the
[verification protocol](../protocols/verification.md).

## Procedure
1. `node scripts/verify-state.mjs` (harness state — always).
2. Run each gate in [`../verification/gates.json`](../verification/gates.json) that is not
   `pending-toolchain`, in order; stop at the first failure.
3. Record commands + results in [`../state/progress.md`](../state/progress.md).

## Rules
- Green-with-evidence is the only "pass."
- A failure means fix the cause — not skip, weaken, or rationalize.
- Prefer running this as the **evaluator** subagent for independence.
