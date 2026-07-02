---
id: surface-new-behavior-via-existing-explainability-field
kind: lesson
title: Surface a new stage behavior through an existing explainability field, not a new cross-package schema field
links:
  - packages/context-compiler/src/stages/compress.ts
  - packages/context-compiler/src/stages/assemble.ts
  - packages/context-compiler/src/stages/compress-text.ts
  - .harness/plans/F-019-compiler-compression-citation-preserving.md
confidence: 0.8
created: 2026-07-02
---

**What happened:** F-019 taught the context compiler's compress stage to **compress** over-budget
fragments (an extractive, citation-preserving excerpt) instead of dropping them (FR-31). The obvious way
to make compression *visible* to the API/inspector would be a new `ContextFragment` field (e.g.
`originalTokens`) — but that ripples across the boundary: the REST/MCP response schemas explicitly list
fragment fields (and would strip an unknown one), so it would force coordinated edits in `@tessera/api`,
`@tessera/mcp`, and the web types.

Instead the change stayed **contained to one package** by carrying the new information through channels
that already flow to consumers:
- the per-fragment **`whyIncluded`** string (already rendered by the inspector) gained a
  `"compressed to fit budget (N→M tokens)"` suffix, and
- the compress **trace stage** gained a `notes` summary (count + tokens saved).

The citation itself (the fragment's `ref` + provenance) is unchanged, so the excerpt stays attributable.
No schema change → no E-003 (REST/MCP/SDK/web) ripple; the inspector shows compression "for free."

**How to apply:**
- Before adding a field to a shared/serialized contract, ask whether an **existing explainability or
  provenance channel** (a "why"/reason string, a trace/notes record, a log field) can carry the fact.
  If the info is for humans/debugging rather than programmatic branching, prefer the existing channel and
  keep the change inside one package.
- Reserve new schema fields for data a **consumer must branch on**; when you do add one, treat it as a
  cross-package effect (update every surface's schema in lockstep — the API response schemas strip
  unknown fields).
- Keep the door open: F-019 left abstractive/pluggable compression to F-020, so the contained surfacing
  choice doesn't preclude a richer, structured representation later.
