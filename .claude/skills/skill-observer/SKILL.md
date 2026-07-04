---
name: skill-observer
description: Capture harness-improvement observations during work and drain them periodically into skill/rule/ADR changes. Shim for the canonical harness skill.
---

This is a Claude Code shim. The **canonical** skill is
[`.harness/skills/skill-observer/SKILL.md`](../../../.harness/skills/skill-observer/SKILL.md) —
read and follow it. It captures Issue / Suggested-improvement / Principle observations into
[`.harness/memory/observations.md`](../../../.harness/memory/observations.md) and, on a periodic
review, turns them into concrete skill/rule/ADR improvements. It is the harness's self-improvement
loop — distinct from `continuous-learning` (durable lessons) and `write-adr` (decisions). Adapted
(CC BY 4.0) from "One Skill to Rule Them All" — see [`NOTICE.md`](../../../NOTICE.md).
