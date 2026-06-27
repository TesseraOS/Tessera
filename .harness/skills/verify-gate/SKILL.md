---
name: verify-gate
description: Run Tessera's verification gates and capture evidence before declaring work done.
---

# Skill: verify-gate

Implements the [verification protocol](../../protocols/verification.md). **Only a passing
run with evidence counts as done.**

## Steps
1. **Validate harness state** (always available, no app code needed):
   `node scripts/verify-state.mjs` — checks `feature_list.json` + `effects.json`.
2. **Run the code gates** defined in
   [`../../verification/gates.json`](../../verification/gates.json). As the toolchain
   lands these are, in order:
   - `typecheck` → `pnpm -w typecheck`
   - `lint` → `pnpm -w lint`
   - `format:check` → `pnpm -w format:check`
   - `test` → `pnpm -w test` (unit + integration; adapter conformance suites)
   - `build` → `pnpm -w build`
   - `e2e` → `pnpm -w test:e2e` (required for user-facing features)
3. **Capture evidence.** Record the commands run and their key output/summary in
   [`progress.md`](../../state/progress.md) and against the feature.
4. **On failure:** fix the **root cause**. Never skip a test, weaken a gate, or mark done
   on red. If a gate is wrong, change it via a recorded decision, not silently.

## Notes
- Pre-toolchain (now), only step 1 runs; steps 2–3 activate when `package.json` and scripts
  exist (gates are marked `pending-toolchain` until then).
- Prefer the **evaluator** subagent to verify independently of the one who implemented.
