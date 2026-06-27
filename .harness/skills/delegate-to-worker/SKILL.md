---
name: delegate-to-worker
description: Offload bulk implementation to the agy/Gemini worker (human-in-the-loop) while Claude plans and independently verifies. Build-phase tooling only.
---

# Skill: delegate-to-worker

Use the `agy`/Gemini **worker** for bulk, well-specified work (scaffolding, test generation,
mechanical migrations, first-pass drafts) so Claude can focus on judgment and verification.
Authoritative decision: [ADR-0012](../../../docs/adr/0012-agy-gemini-worker-build-tooling.md).
**Build tooling only — never a Tessera product dependency.**

> **Why human-in-the-loop:** `agy` needs a real terminal (TTY) and interactive auth; a
> non-TTY process (Claude's sandbox) makes it hang. So **a human runs the worker**; Claude
> specs the task and verifies the result.

## Roles (planner / generator / evaluator, with an external generator)
- **Claude = planner + evaluator.** Writes the scoped spec; later verifies independently.
- **`agy`/Gemini = generator (worker).** Implements the spec on a dedicated branch.
- **Human = trigger.** Runs the guarded wrapper in a real terminal, approves agy's tool
  prompts.

## When to delegate (and when NOT)
- **Good:** large but well-bounded, low-judgment work with clear acceptance and tests.
- **Avoid:** security-sensitive code, architecture/contract decisions, anything needing
  secrets, or work whose scope you can't write down crisply. Never delegate what you can't
  verify.

## Procedure
1. **Plan & scope (Claude).** Pick the feature (`add-feature` flow). Write a **worker spec**:
   the exact task, the **files/dirs in scope** (and explicitly out of scope), acceptance
   criteria, the tests to add, and "do not touch X / do not run destructive commands / do
   not add dependencies without noting them." Save it (e.g. alongside the feature plan).
2. **Dedicated branch.** Create `feat/F-00x-worker` so the worker's output is isolated and
   reversible.
3. **Delegate (human).** Run the guarded wrapper in a real terminal (it defaults to
   **interactive** mode so you see progress and approve agy's tool reviews):
   ```
   # Windows PowerShell 5.1 (no 'pwsh' unless PowerShell 7 is installed):
   .\scripts\agy-worker.ps1 -Spec <spec.md> -Branch feat/F-00x-worker -Dir <scoped-dir>
   # POSIX:
   bash scripts/agy-worker.sh --spec <spec.md> --branch feat/F-00x-worker --dir <scoped-dir>
   ```
   The wrapper enforces the guardrails (scoped `--add-dir`, log file, dirty-tree guard, **no**
   `--dangerously-skip-permissions`, no secrets). **Prereq:** `agy` must be authenticated once
   (`agy` interactive login → `agy models` lists models). `-Headless`/`--headless` uses
   `agy --print`, which prints nothing until the full response is ready — don't mistake that
   for a hang.
4. **Verify independently (Claude = evaluator).** Review the branch diff against the spec and
   run the [verification protocol](../../protocols/verification.md). Treat the worker as
   **untrusted**: it may be wrong or may have "made a check pass" — re-run the gates yourself.
5. **Trace effects** ([effect-trace](../effect-trace/SKILL.md)); update
   [`effects.json`](../../state/effects.json) if a shared contract changed.
6. **Accept or reject.** Only merge into the feature branch once gates are green *with
   evidence* and the [definition-of-done](../../protocols/definition-of-done.md) holds.
   Record outcome (and cost) in [`progress.md`](../../state/progress.md). If rejected, refine
   the spec and re-delegate, or do it directly.

## Guardrails (also enforced by the wrapper + [policy-model](../../governance/policy-model.md))
- Dedicated branch; scoped workspace; timeout + log file always set.
- **Never** `--dangerously-skip-permissions` on the real repo; **never** pass secrets.
- No auto-commit/push; the human/Claude decides.
- Keep proprietary/sensitive code out of delegated scope (data leaves to Gemini).
