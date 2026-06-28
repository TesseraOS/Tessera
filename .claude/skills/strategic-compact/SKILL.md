---
name: strategic-compact
description: Compact the context window deliberately at task boundaries (not mid-task) so long sessions stay coherent. Shim for the canonical harness skill.
---

This is a Claude Code shim. The **canonical** skill is
[`.harness/skills/strategic-compact/SKILL.md`](../../../.harness/skills/strategic-compact/SKILL.md)
— read and follow it. In short: at research→plan, plan→implement, after a failed approach, or
feature→next-feature, ensure state is in files, then `/compact`. Never compact mid-implementation.
