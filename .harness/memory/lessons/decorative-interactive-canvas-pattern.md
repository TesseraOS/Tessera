---
id: decorative-interactive-canvas-pattern
kind: lesson
title: Ship interactive marketing canvases as decorative-interactive — keyboard-inert, aria-hidden, scroll-priority, lazy, frozen under reduced motion
links:
  - apps/marketing/components/art/live-graph.tsx
  - apps/marketing/components/home/hero-graph.tsx
  - apps/marketing/components/home/effect-web-lazy.tsx
  - docs/adr/0044-marketing-v3-dual-themes-illustration-first-live-graph.md
confidence: 0.9
created: 2026-07-07
---

**What happened:** F-051 v3's hero is a live React Flow knowledge graph with simulated
telemetry. Getting it production-grade required a repeatable configuration bundle — and
one miss (the below-fold mini graph imported `@xyflow/react` eagerly) blew the first-load
JS budget by 56KB until it got the same lazy treatment (283 → 227KB gz).

**Why:** an interactive canvas on a marketing page is *decoration that responds*, not an
application surface. Treated as an app it breaks a11y (focusable nodes inside decoration),
scroll UX (zoom hijack), CWV (eager engine chunk), and honesty (unlabeled fake numbers).

**How to apply — the bundle, all six together:**
1. `ssr:false` dynamic import behind a client wrapper; placeholder reserves height (CLS 0);
   **every** instance of the engine loads lazily, not just the first one you think of.
2. Keyboard-inert + `aria-hidden`: `nodesFocusable/edgesFocusable=false`,
   `disableKeyboardA11y`, zero focusables inside; a sibling `sr-only` text alternative.
3. Page scroll always wins: `zoomOnScroll/zoomOnPinch/panOnScroll=false`,
   `preventScrolling=false`.
4. Simulated data ticks client-side only, never a network call, and is **visibly labeled**
   ("simulated telemetry · demo") — the honesty rule survives the theater.
5. Reduced motion ⇒ static layout, frozen values, no edge animation (gate the intervals on
   `useReducedMotion`).
6. Engine imports confined by design-lint to `components/art/*` so future canvases inherit
   the same discipline.
