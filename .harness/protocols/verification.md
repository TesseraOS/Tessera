# Protocol: Verification

**Trigger:** before declaring any work done. **Verification — not prompting or confidence
— is the proof.** Agents declare victory too early; this protocol prevents it.

## Principle
Only a **passing run with captured evidence** counts. "It should work," "it compiles," or
"I think it's fine" are **not** verification.

## Gates (in order — stop at first failure)
Defined in [`../verification/gates.json`](../verification/gates.json):

| # | Gate | Command (when toolchain present) | Required for |
|---|------|----------------------------------|--------------|
| 0 | state | `node scripts/verify-state.mjs` | always |
| 1 | typecheck | `pnpm -w typecheck` | any code |
| 2 | lint | `pnpm -w lint` | any code |
| 3 | format | `pnpm -w format:check` | any code |
| 4 | test | `pnpm -w test` | any code |
| 5 | build | `pnpm -w build` | any code |
| 6 | e2e | `pnpm -w test:e2e` | user-facing features |

Adapter changes must run the relevant **conformance suite**; the change isn't verified
until every adapter passes ([ADR-0003](../../docs/adr/0003-local-first-cloud-ready-ports-and-adapters.md)).

## Evidence
Record, against the feature and in [`progress.md`](../state/progress.md): which gates ran,
the commands, and a short result summary. No evidence ⇒ not done.

## On failure
Fix the **root cause**. Do **not**: skip/delete a test, lower a threshold, weaken a gate,
or mark `done` on red. A gate that is genuinely wrong is changed deliberately and recorded,
never bypassed silently.

## Independence
Prefer verifying with the **evaluator** subagent
([`../../.claude/agents/evaluator.md`](../../.claude/agents/evaluator.md)) so the checker is
not the implementer.

> Pre-toolchain: only gate 0 is active; gates 1–6 are `pending-toolchain` and activate as
> `package.json`/scripts land.
