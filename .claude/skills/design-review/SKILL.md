---
name: design-review
description: Audit a built/changed screen against deterministic design anti-patterns before declaring UI done. Shim for the canonical harness skill.
---

This is a Claude Code shim. The **canonical** skill is
[`.harness/skills/design-review/SKILL.md`](../../../.harness/skills/design-review/SKILL.md) —
read and follow it. It runs an audit → critique → polish → live-verify pass against deterministic
design anti-patterns, **subordinate to**
[`DESIGN-SYSTEM.md`](../../../docs/design/DESIGN-SYSTEM.md), and uses the `preview_*` tools for
live checks. Adapted (Apache-2.0) from `impeccable` — see
[`NOTICE.md`](../../../NOTICE.md).
