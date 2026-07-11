---
id: xml-comment-double-hyphen-breaks-svg-as-image
kind: lesson
title: A `--` inside an XML comment (e.g. a `--flag` in a "how to regenerate" note) silently breaks SVG-as-image — browsers show the broken-image icon with no request failure
links:
  - packages/mascot/src/masters.ts
  - docs/design/brand/tessera-mascot.svg
  - docs/adr/0046-brand-mascot-tess.md
confidence: 0.95
created: 2026-07-11
---

**What happened:** F-066's generated brand masters embedded a provenance note:
`<!-- ... regenerate with pnpm --filter @tessera/mascot render-masters -->`. Inline in
HTML the SVG rendered fine, but as an `<img>`/standalone asset every browser showed the
broken-image icon. No console error, no failed network request — the response was 200.

**Why:** XML 1.0 forbids `--` anywhere inside a comment (the sequence is reserved for
`-->`). Standalone SVG is parsed by the **strict XML parser**, which rejects the
document; the lenient HTML parser (inline `<svg>`) tolerates it. So the same bytes work
inline and fail as an image — a failure mode that skips both console and network panels,
and CLI flags (`--filter`, `--force`) are exactly the kind of text that ends up in
generated-file provenance comments.

**How to apply:**
1. Never put `--` in an XML/SVG comment — spell flags out ("the package script
   `render-masters`") or drop them.
2. Generated-asset renderers should keep provenance notes hyphen-safe by construction
   (a code comment now guards `GENERATED_NOTE` in `masters.ts`).
3. When an SVG shows as a broken image but works inline, suspect strict-XML validity
   first (comments, unescaped `&`, unclosed tags) — not the HTTP layer.
4. The drift test + visual review (screenshot of the asset AS an `<img>`) catches this
   class; reviewing only inline renders would not.
