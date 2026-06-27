---
description: Delegate a scoped task to the agy/Gemini worker (human-in-the-loop); Claude plans + verifies.
argument-hint: <feature-id> [scope notes]
---

Follow the canonical skill at `.harness/skills/delegate-to-worker/SKILL.md` and
ADR-0012 (`docs/adr/0012-agy-gemini-worker-build-tooling.md`).

Steps: (1) **plan + write a scoped worker spec** (task, in/out-of-scope files, acceptance,
tests, prohibitions); (2) ensure a **dedicated branch** `feat/<id>-worker`; (3) the **human**
runs the guarded wrapper in a real terminal (interactive by default) —
`.\scripts\agy-worker.ps1 -Spec <spec> -Branch feat/<id>-worker -Dir <scoped-dir>`
(or `bash scripts/agy-worker.sh ...`); (4) **independently verify** the branch with the
`evaluator` subagent + `/verify` — treat the worker as untrusted; (5) trace effects, then
accept/reject and record outcome + cost in `.harness/state/progress.md`.

Note: I cannot run `agy` myself (it needs a real TTY/console and hangs in my non-TTY sandbox)
— the human triggers the worker; I write the spec and verify. `agy` does work in the user's
real terminal (it authenticates and streams from Gemini). Never use
`--dangerously-skip-permissions` on the real repo; never pass secrets.
