---
name: motion
description: Add functional motion to the dashboard with Framer Motion — fast, interruptible, purposeful, and prefers-reduced-motion-safe. Operationalizes DESIGN-SYSTEM §5.
---

# Skill: motion

Motion communicates **state and causality** — never decoration. Use when adding transitions,
micro-interactions, or animated state changes.

> Adapted from **Emil Kowalski's** animation skill (MIT) — see [`NOTICE.md`](../../../NOTICE.md).
> Operationalizes [`DESIGN-SYSTEM.md` §5](../../../docs/design/DESIGN-SYSTEM.md).

## Principles
- **Functional, not ornamental.** Animate to show what changed and why (enter/exit, expand,
  reorder, optimistic update reconciling). If it doesn't aid comprehension, don't animate it.
- **Fast & interruptible.** ~150–250ms; ease-out for entrances. The user can always interrupt;
  never block input behind an animation.
- **Respect `prefers-reduced-motion`.** Provide a reduced/no-motion path for every animation
  (fade/instant instead of move/scale). This is part of the accessibility gate (NFR-9).

## Patterns (Framer Motion)
- **Micro-interactions:** hover/press/focus feedback, subtle state transitions — small, quick.
- **Layout/reorder:** use layout animation for list/grid changes instead of manual tweens.
- **Loading:** prefer **skeletons** over spinners; stagger content in.
- **Optimistic UI:** reflect the action immediately; animate the reconcile/rollback on the
  server response (TanStack Query mutation).

## Don'ts
- No long, looping, or attention-stealing animation; no animating large lists per-item on mount.
- No motion that moves focus or causes layout jank; measure if a transition affects first paint.
- Don't animate when `prefers-reduced-motion: reduce` is set — fall back gracefully.
