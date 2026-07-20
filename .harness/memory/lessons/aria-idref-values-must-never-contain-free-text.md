---
id: aria-idref-values-must-never-contain-free-text
kind: lesson
title: Component labels that become DOM ids must be IDREF-safe — fumadocs Tabs derives Radix ids from item text with replace(/\s/, '-') (first space only)
links:
  - apps/docs/content/docs/agents/claude-code.mdx
  - docs/design/DOCS-DESIGN.md
confidence: 0.95
created: 2026-07-20
---

**What happened:** The docs agent pages used descriptive fumadocs Tabs labels —
`'npx (at launch — F-059)'` — and axe flagged a **critical** `aria-valid-attr-value`
violation on every one. fumadocs-ui derives each tab's value (and Radix's
`aria-controls`/panel id) from the item string via `v.toLowerCase().replace(/\s/, '-')`
— **no `g` flag**, so only the first space becomes a hyphen and the rest survive into
the DOM id. `aria-controls` is a space-separated **IDREF list**, so an id containing
spaces parses as several references to non-existent elements. `getElementById` happily
finds ids with spaces, which is why a "does the target exist" probe said everything was
fine while axe (correctly) failed.

**The rule:** any string a component library turns into an element id — tab items,
accordion values, heading slugs — must be treated as an identifier, not prose. Keep
labels that feed id derivation short and effectively slug-safe (at most one whitespace
run for this fumadocs version), and put the qualifying prose inside the panel body
instead. When axe reports `aria-valid-attr-value` on Radix-style generated ids, check
for whitespace in the id before suspecting the library's wiring.

**How to apply:** In apps/docs, Tabs items are `['npx', 'From source']`-shaped; the
labeling ("pending F-059") lives in the tab content. If a future fumadocs release fixes
the derivation (global replace or full slugging), longer labels become safe — the e2e
axe battery on both themes is the gate that says so.
