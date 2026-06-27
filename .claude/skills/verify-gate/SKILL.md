---
name: verify-gate
description: Run Tessera's verification gates and capture evidence before declaring work done. Shim for the canonical harness skill.
---

This is a Claude Code shim. The **canonical, authoritative** skill is
[`.harness/skills/verify-gate/SKILL.md`](../../../.harness/skills/verify-gate/SKILL.md) —
read and follow it. It runs the gates in
[`.harness/verification/gates.json`](../../../.harness/verification/gates.json) per the
[verification protocol](../../../.harness/protocols/verification.md). Prefer running it as
the `evaluator` subagent.
