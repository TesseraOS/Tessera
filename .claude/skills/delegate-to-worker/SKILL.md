---
name: delegate-to-worker
description: Offload bulk work to the agy/Gemini worker (human-in-the-loop) while Claude plans and independently verifies. Build tooling only. Shim for the canonical harness skill.
---

This is a Claude Code shim. The **canonical, authoritative** skill is
[`.harness/skills/delegate-to-worker/SKILL.md`](../../../.harness/skills/delegate-to-worker/SKILL.md)
— read and follow it. Decision: ADR-0012. Wrapper: `scripts/agy-worker.ps1` / `.sh` (run by
a human in a real terminal — Claude cannot drive `agy` from its sandbox). Claude plans the
scoped spec and verifies with the `evaluator` subagent; the worker is untrusted.
