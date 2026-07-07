---
id: custom-text-tokens-require-twmerge-font-size-group
kind: lesson
title: Custom Tailwind text-size tokens silently eat color classes unless tailwind-merge learns them as a font-size group
links:
  - apps/marketing/lib/utils.ts
  - apps/marketing/app/globals.css
  - docs/design/marketing-design.manifest.json
  - docs/design/MARKETING-DESIGN.md
confidence: 0.95
created: 2026-07-07
---

**What happened:** F-051's marketing app defines a closed type scale as custom Tailwind v4
tokens (`text-display` … `text-label`, with `--text-*: initial` removing the defaults). The
`cn()` helper (clsx + tailwind-merge) then produced buttons with `bg-primary` but **no**
`text-primary-foreground`: near-white text on a near-white button (1.04:1). Nothing failed at
build time — axe e2e caught it as 178 WCAG contrast violations.

**Why:** tailwind-merge classifies unknown `text-*` utilities heuristically. It treated
`text-small` (a font-size) and `text-primary-foreground` (a color) as members of the same
conflicting group and kept only the later one. Any custom `text-<name>` token reintroduces
this ambiguity; the drop is silent and only visible in the rendered page.

**How to apply:** whenever an app defines custom font-size tokens, extend tailwind-merge in
the same change: `extendTailwindMerge({ extend: { classGroups: { 'font-size': [{ text:
[...the exact closed scale...] }] } } })` (see `apps/marketing/lib/utils.ts`). The scale now
lives in three places that must agree — `globals.css` `@theme`, the twMerge font-size group,
and the design manifest — so adding a text token means touching all three (effect-link
E-022). And keep an axe e2e on every surface: it is the net that catches silent class drops.
