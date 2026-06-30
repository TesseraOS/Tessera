---
name: frontend-craft
description: Give the dashboard real taste — typography hierarchy, spacing rhythm, restraint, and layout — to avoid generic "AI slop" UI, always subordinate to Tessera's DESIGN-SYSTEM.md.
---

# Skill: frontend-craft

Craft heuristics that turn correct-but-generic UI into something legible and intentional. Use
when building or reviewing any screen.

> Adapted from **Anthropic's `frontend-design`** (Apache-2.0) and **Leonxlnx `taste-skill`**
> (MIT), with typography/motion lineage from Emil Kowalski and `impeccable` — see
> [`NOTICE.md`](../../../NOTICE.md).

> **Subordinate to our system.** Where any craft heuristic here conflicts with
> [`DESIGN-SYSTEM.md`](../../../docs/design/DESIGN-SYSTEM.md), **our design system wins.** In
> particular, principle #1 is **"restraint over richness"** — these heuristics sharpen clarity;
> they do not license decorative flourish, bold-for-its-own-sake, or off-token color.

## Typography
- Establish hierarchy with **size, weight, and line-height** — not color alone. Use the
  manifest's type scale; don't invent sizes. Limit to the defined families (one sans + mono).
- Body text is comfortable to read: generous line-height, sensible measure (line length),
  monospace for code/IDs/provenance.

## Spacing & layout
- Use the 4px spacing scale with a **consistent rhythm**; align to a grid. Whitespace is a
  feature ("legibility as luxury") — don't cram.
- Strong visual hierarchy: one primary action per view; group related controls; progressive
  disclosure over showing everything at once.

## Color & restraint
- Color carries meaning, not decoration. Lean on `--muted`/`--foreground`; reserve `--primary`
  and `--destructive` for genuine emphasis/danger. Categorical data uses `--chart-*`.
- No gratuitous gradients/shadows; use the fixed elevation set. Avoid the generic "AI gradient
  hero" look — favor crisp, content-first surfaces.

## Anti-slop review
Does it look like a template? · Is the hierarchy obvious at a glance? · Any off-token value? ·
Too many competing accents? · Enough whitespace? · Does every element earn its place?
