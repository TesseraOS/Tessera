---
name: build-ui
description: Build a Tessera dashboard UI feature end-to-end (server-first, tokens, shadcn, UX baseline, motion, a11y). Shim for the canonical harness skill.
---

This is a Claude Code shim. The **canonical** skill is
[`.harness/skills/build-ui/SKILL.md`](../../../.harness/skills/build-ui/SKILL.md) — read and
follow it. It sequences [`shadcn`](../shadcn/SKILL.md),
[`frontend-craft`](../frontend-craft/SKILL.md), and [`motion`](../motion/SKILL.md), and enforces
[`docs/design/DESIGN-SYSTEM.md`](../../../docs/design/DESIGN-SYSTEM.md) (+ its machine-readable
[manifest](../../../docs/design/design-system.manifest.json)).
