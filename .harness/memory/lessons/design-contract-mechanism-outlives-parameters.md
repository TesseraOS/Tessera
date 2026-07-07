---
id: design-contract-mechanism-outlives-parameters
kind: lesson
title: Encode taste as swappable parameters over a stable enforcement mechanism — and know this stakeholder's taste
links:
  - docs/design/marketing-design.manifest.json
  - docs/design/BRAND.md
  - docs/adr/0043-terra-mosaic-brand-and-marketing-overhaul.md
  - apps/marketing/tests/design-lint.test.ts
confidence: 0.95
created: 2026-07-07
---

**What happened:** F-051's first marketing increment passed every gate — and the project
lead rejected it outright: "lifeless, only text, where is art?" The direction (near-black
monochrome, one emerald accent, CSS-only minimal motion) had encoded *restraint* as if it
were the only defense against AI-slop. The overhaul (ADR-0043) reversed almost every
visual parameter — warm Desert Rose × Modern Minimalist palette, Instrument Serif voice,
living tessellation art, framer-motion — **and the harness absorbed the reversal in one
manifest+doc edit**: the design-lint gate, the review protocol, the honesty/a11y floor all
survived unchanged.

**Why:** the ADR-0042 *mechanism* (binding doc → machine manifest → gate-compiled
patterns) is orthogonal to the *parameters* it enforces. Slop is prevented by
"decoration must be sanctioned and tokenized," not by "no decoration."

**How to apply:**
1. When encoding design systems for agents, keep the enforcement machinery
   parameter-free (pattern lists live in data, not in test code), so a taste pivot is a
   data change, not a rewrite.
2. Sanction expressive devices explicitly (named gradients, shadow tokens, an ambient
   motion budget, an import seam like `lib/motion.tsx`) instead of banning categories
   outright — bans invite rejection, budgets survive it.
3. **This project lead's bar (remember it):** austere minimalism reads as *lifeless AI
   slop* to them. They want warmth (Desert Rose tones), serif personality, real art
   (SVG tessellations), motion with emotion, microinteractions — Awwwards-grade craft —
   while keeping honesty (nothing fabricated) and WCAG AA. Design *toward* that, not
   toward Linear-style austerity.
