---
name: shadcn
description: Find, install, compose, and customize shadcn/ui components in apps/web — owned-in-repo, Radix-accessible, themed only via design tokens.
---

# Skill: shadcn

How to use **shadcn/ui** as Tessera's component layer (locked in
[ADR-0009](../../../docs/adr/0009-frontend-stack-and-design-system.md)). shadcn components are
**owned in-repo** (copied in, not a black-box dependency) — we maintain and audit them.

> Adapted from the official **shadcn/ui** skill (MIT) — see [`NOTICE.md`](../../../NOTICE.md).

## Workflow
- **Find first.** Before hand-writing a widget, check the manifest's component inventory
  ([`design-system.manifest.json`](../../../docs/design/design-system.manifest.json) →
  `components`) and shadcn's catalog. One component per job; compose primitives instead of
  bespoke widgets.
- **Install via the CLI** into `apps/web` (components land in-repo under the app's `ui/`). Pin
  to the project's React/Next/Tailwind versions; don't pull a component that drags in a
  conflicting dependency.
- **Compose, don't fork.** Build features by composing primitives (`Field`/`Form`,
  `Dialog`/`Sheet`/`Popover`, `Table`, `Command` for ⌘K). Extend via props/slots and Tailwind
  utilities — avoid editing primitive internals unless fixing a real accessibility/behavior gap.

## Theming (tokens only)
- Color/radius/spacing come from **semantic CSS variables** authored with
  [tweakcn](https://tweakcn.com/editor/theme) and exported into the app. **Never hardcode**
  values in a component — only token classes/vars. Light/dark/system must all resolve.
- Accessibility comes from Radix/Base-UI underneath — preserve it: keep labels, roles, focus
  management, and escape/return behavior when you wrap a primitive.

## Don'ts
- No second component library for a job shadcn already covers (no UI sprawl).
- No business logic in components — call the API via `@tessera/sdk` + TanStack Query.
- No theme branching in components — the token layer handles light/dark.

> Meta's **Astryx** (StyleX, agent-ready) was evaluated and deferred to an R1 watch-item; see
> [ADR-0021](../../../docs/adr/0021-frontend-harness-and-design-skill-adaptation.md). Until a
> superseding ADR, shadcn/ui is the component layer.
