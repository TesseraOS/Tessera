---
id: framer-svg-transform-attribute-conflict
kind: lesson
title: framer-motion x/y on SVG elements are CSS transforms that OVERRIDE the transform attribute — position with geometry attrs, animate only deltas
links:
  - apps/marketing/components/art/compiler-assembly.tsx
  - apps/marketing/components/art/governance-gate.tsx
  - docs/adr/0045-marketing-v4-constellation-shader-hero-theme-true-chapters.md
confidence: 0.95
created: 2026-07-08
---

**What happened:** F-051's CompilerAssembly positioned SVG tiles with
`transform="translate(x, y)"` and animated framer `x/y` deltas on top. On SVG elements,
framer's `x`/`y` write `style.transform` — and CSS transforms **replace** the SVG
`transform` attribute entirely. Every tile lost its base translation: the "scattered"
phase rendered at negative coordinates (clipped off the left edge — the stakeholder's
"illustration is being cut off"), and the "assembled" phase stacked all tiles at the
origin.

**Why:** SVG has two transform channels (presentation attribute vs CSS), and CSS wins.
framer-motion only manages the CSS channel; it cannot compose with an attribute it
doesn't know about. The failure is silent — no error, just wrong geometry.

**How to apply:**
1. Give every animated SVG shape its resting position via **geometry attributes**
   (`x=`, `y=` on rect; `cx/cy` on circle) — never via the `transform` attribute.
2. Treat framer `x/y` as **delta translations from that resting place** (start offset →
   animate to 0), and `rotate` needs `transform-box: fill-box; transform-origin: center`
   (the `.tf-box` utility).
3. If a base transform is truly unavoidable, wrap the shape in a plain `<g transform=…>`
   and put the motion component inside it — separate elements, separate channels.
