---
id: heavy-canvas-dep-offline-lazy-and-accessible-alternative
kind: lesson
title: A data-viz canvas (React Flow) ships lazy/offline/code-split AND needs a non-canvas keyboard-accessible alternative to pass WCAG; extend the API read-only for the viz with REST+MCP+SDK parity
links:
  - apps/web/components/graph/graph-canvas.tsx
  - apps/web/components/graph/graph-view.tsx
  - apps/web/components/graph/graph-side-panel.tsx
  - apps/web/lib/graph-layout.ts
  - apps/api/src/routes/v1/graph.ts
  - packages/knowledge-graph/src/service/knowledge-graph-service.ts
confidence: 0.85
created: 2026-07-06
---

**What happened:** F-043 visualized the knowledge graph with React Flow (`@xyflow/react`). Beyond the
now-familiar heavy-dep handling (see [[monaco-offline-in-next-and-virtualization-jsdom]] — lazy
`ssr:false` dynamic import, code-split out of the initial bundle, self-contained/offline, build-spike
first, stub in jsdom tests), three graph-viz-specific lessons:

1. **A canvas is not accessible on its own — provide a documented keyboard-navigable alternative.** A
   `<canvas>`/SVG graph can't be operated by a keyboard or read by a screen reader. Rather than fight
   that, render a **parallel accessible surface**: here, a side panel with the selected node's detail +
   its connections (Explore) and the ranked-dependents list (Effects) — all real DOM (headings, lists,
   buttons), plus **search-to-focus** (type → pick a node from a list → it selects/highlights). The
   canvas gets an `aria-label` and is treated as supplementary. This satisfies "WCAG AA + a keyboard
   alternative documented" AND makes the feature genuinely usable without a mouse.

2. **React Flow renders in the real e2e and passes axe when the chrome is accessible.** Don't mock the
   canvas away in the Playwright e2e — let it render (prod build) and run axe on the whole page; it's
   clean as long as your toolbar/panel/controls are accessible. Mock the canvas only in **jsdom unit
   tests** (no layout/WebGL there) and cover the layout math with a **pure `toFlow` transform** tested
   directly (incl. a large-graph budget, e.g. 5000 nodes < 500ms) — the same split as virtualization.

3. **A viz that needs data the API doesn't expose = extend the API read-only, with parity.** The graph
   store already had `listNodes`/`listEdges` but the service didn't surface them; add a small additive
   `queryGraph(filter?)` (bounded by a `limit` LOD cap; return a **coherent subgraph** — edges confined
   to the returned nodes) → one `GET /v1/graph` route (Zod→OpenAPI→regenerated SDK) **and** an MCP
   `query_graph` tool (ADR-0036 REST+MCP parity — a UI-facing read is still an agent-facing capability).
   Rebuild the producing package's `dist` before the API/SDK typecheck sees the new member, and update
   any hard-coded "every tool" list test when you add an MCP tool.

**Performance for big graphs:** level-of-detail beats brute force — cap the API result, cull the
viewport (`onlyRenderVisibleElements`), keep an O(n) dep-light layout (a kind-clustered grid, not
dagre/elk), and offer focus/Effects mode instead of dumping everything. A *benchmarked* perf gate is a
separate concern (F-049); here the 5k-node `toFlow` test + culling demonstrate the strategy.
