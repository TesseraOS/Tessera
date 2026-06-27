# Verification

The machine- and human-readable definition of "verified." Drives the
[verification protocol](../protocols/verification.md) and the
[`verify-gate`](../skills/verify-gate/SKILL.md) skill.

| File | Purpose |
|------|---------|
| [`gates.json`](gates.json) | Ordered, machine-readable gate definitions + commands + status. |
| [`checklist.md`](checklist.md) | Definition-of-done checklist + harness-methodology self-audit. |

## Status of gates today
Only the **state** gate (`node scripts/verify-state.mjs`) is active pre-toolchain. The
code gates (typecheck/lint/format/test/build/e2e) are `pending-toolchain` and activate
automatically once `package.json` and workspace scripts exist — no harness change needed,
just flip their status in `gates.json`.
