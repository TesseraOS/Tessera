# Plan: F-043 — Dashboard: knowledge-graph & effect-links visualization (React Flow)

- **Feature:** F-043 (see [`../state/feature_list.json`](../state/feature_list.json)) · **Requirements:** FR-42 (graph viz UI), FR-19 (get_effects — ranked, path-bearing dependents)
- **ADRs:** none new. Extends the existing KG surface (F-008/F-040) with a read-only **graph query** (the acceptance's "extend /v1 as needed"); consumes it + `get_effects` via the interim `lib/api` client (ADR-0022; `@tessera/sdk` adoption is F-045). Applies the ADR-0036 agent-first parity rule (REST **+** MCP). New client dep `@xyflow/react` (React Flow) recorded in the feature notes.
- **Packages:** `@tessera/knowledge-graph` (add a query method) + `@tessera/api` (`GET /v1/graph`) + `@tessera/mcp` (`query_graph` tool) + `@tessera/sdk` (regen) + `@tessera/web` (the viz). **Author:** Claude · **Date:** 2026-07-06
- **Verification:** typecheck · lint · test · e2e (+ format/build/state green) + **screenshot-verify**.

## Intent
The `/graph` **ComingSoon stub** becomes an explorable **React Flow** view of the live knowledge graph (F-040 populates it from real code): browse files/symbols/modules/decisions/memories and their edges, filter by node/edge type, search-to-focus, expand a node's neighborhood, and switch to **Effects mode** — pick a node → `get_effects` renders **ranked dependents with the reaching paths highlighted** and per-link rationale/confidence (provenance-first). All real data over `/v1` (no fabrication, ADR-0022).

## Boundaries confirmed by reading the code
- **The store already supports it; the service doesn't expose it.** `GraphStore` has `listNodes(filter?)` + `listEdges(filter?)` (used internally by `deriveStaticEffectLinks`), but `KnowledgeGraphService` exposes only upsert/assert/derive/remove/getEffects/forTenant. So the KG change is a **small additive** `queryGraph(filter?) → { nodes, edges }` on the service (wraps the store; tenant-scoped). No port/adapter/store change → no conformance-suite churn (E-011 additive).
- **Effects data already has a shape:** `EffectHit { nodeId, node, path: NodeId[], distance, score }` + `graphNodeSchema` + `effectHitSchema` exist in `schemas/effects.ts` — reuse for the graph schema (node) and Effects mode.
- **`lib/api` has no effects/graph methods yet** — add `getEffects(kind,key,maxDepth?)` + `queryGraph(filter)`.
- **Nav already lists "Knowledge graph"** (Explore group) in both sources — no nav change.
- **React Flow is heavy → de-risk first + code-split** (mirrors the F-042 Monaco approach): `@xyflow/react`, lazy `next/dynamic({ ssr:false })`, `onlyRenderVisibleElements` for viewport culling, a bounded query (default node cap) + neighborhood expansion instead of dumping the whole graph.

## Approach / increments (each keeps gates green + is committed)

### Increment 1 — graph query surface (`@tessera/knowledge-graph` + `@tessera/api` + MCP + SDK)
- **`@tessera/knowledge-graph`:** add `KnowledgeGraphService.queryGraph(filter?: { nodeKinds?: NodeKind[]; edgeKinds?: EdgeKind[]; limit?: number }) → Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>` — `store.listNodes` (capped by `limit`, default e.g. 500) + `store.listEdges` filtered to edges whose endpoints are in the returned node set (a coherent subgraph). Additive; `forTenant` propagates. + a service unit test (returns nodes/edges; respects `limit`; edges confined to the node set; tenant isolation).
- **`@tessera/api`:** `schemas/graph.ts` — `graphNodeSchema` (reuse) + `graphEdgeSchema` (id/from/to/kind/rationale?/confidence?/origin?/metadata) + `graphQuerySchema` (nodeKinds?/edgeKinds? CSV→array, limit? coerced, cap 5000) + `graphResponseSchema { nodes, edges }`. `routes/v1/graph.ts` — `GET /v1/graph` (`effects:read`, `forTenant(tenantOf(request))`, `config.audit: 'effects.read'`). Register in `routes/v1/index.ts`. `services.ts` untouched (graph service already on `ApiServices`). Export the schemas from `index.ts`. Regenerate the SDK (`scripts/generate.mjs` + build). e2e: register a fixture graph (via upsert) → `GET /v1/graph` returns it; viewer allowed (effects:read).
- **`@tessera/mcp` (ADR-0036 parity):** `query_graph` tool wrapping `services.graph.forTenant(...).queryGraph(...)` (gateway `TOOL_PERMISSIONS` → `effects:read`). Token-lean structured result. e2e: a member queries the graph; the tool is listed.

### Increment 2 — de-risk React Flow + web data layer
- Deps: `@xyflow/react`. `components/graph/graph-canvas.tsx` — a **client-only, lazy** wrapper (`next/dynamic(() => import('./graph-canvas-impl'), { ssr:false, loading:<Skeleton/> })`); `graph-canvas-impl.tsx` renders `<ReactFlow>` with `onlyRenderVisibleElements`, `nodesDraggable={false}` by default, `fitView`, a `<Background/>` + `<Controls/>` + `<MiniMap/>`, themed via CSS-var tokens (import `@xyflow/react/dist/style.css` + a token override). **Verify `next build` green with a throwaway usage before building the rest.**
- `lib/api`: `types.ts` (GraphNode/GraphEdge/GraphResponse/GraphQuery + EffectHit/EffectsResponse + NODE_KINDS/EDGE_KINDS mirrors), `client.ts` (`queryGraph`, `getEffects`), `hooks.ts` (`useGraph(filter)`, `useEffects(ref, enabled)`).
- A pure `lib/graph-layout.ts` — `toFlow(nodes, edges, { focus?, effectPaths? })` mapping domain nodes/edges → React Flow `Node[]`/`Edge[]` with a **deterministic layout** (a lightweight layered/force-free positioning — e.g. group by kind into columns + index rows, no heavy layout lib) and edge styling (effect-links dashed/colored; highlighted paths accented). **Pure + unit-tested** (no canvas).

### Increment 3 — the graph explorer UI (`/graph`)
- `components/graph/graph-view.tsx`: header + a toolbar — **mode toggle** (Explore | Effects), **node-kind filters** (multi-select chips), a **search** box (search-to-focus: match by key/label → select + center), and a stats line (N nodes · M edges, capped notice). Below: the lazy `GraphCanvas` + a **side panel** (selected node: kind/key/label/metadata; its edges; an "Expand neighborhood" action; in Effects mode, the **ranked dependents list** with path + rationale/confidence). Full loading/empty (no graph yet → guidance to scan a source)/error states.
- **Explore mode:** `useGraph({ nodeKinds, limit })` → `toFlow` → canvas. Click a node → select (side panel) → "Expand neighborhood" merges that node's effects/edges.
- **Effects mode:** select a node → `useEffects({kind,key})` → highlight the reaching **paths** in the canvas + the ranked list (provenance-first). 
- **a11y:** the canvas is a supplementary visual; the **side-panel ranked list + node list is the keyboard-navigable alternative** (documented in the view + notes). Canvas gets an `aria-label`; all chrome (toolbar/panel) is axe-clean. Respect `prefers-reduced-motion` (React Flow fitView animation off when reduced).
- `app/graph/page.tsx`: replace `ComingSoon` with `<GraphView />`.

### Increment 4 — performance + tests + records
- **Perf (≥5k nodes):** `toFlow` unit-tested against a **5k-node fixture** (builds Flow data within a time budget); the canvas uses `onlyRenderVisibleElements` (viewport culling) + the API caps the fetched set (default 500, max 5000) with neighborhood expansion for exploration — documented as the level-of-detail strategy. (A benchmarked perf *gate* is F-049; here we demonstrate LOD + culling + a bounded query + the 5k transform test.)
- **Unit (vitest+RTL):** pure `toFlow` (kinds→layout, effect edges styled, path highlight, 5k-node budget); `graph-view` (renders stats/filters/empty/error; mode toggle; selecting a node shows the panel — **mock the canvas** to a list so tests don't load React Flow); client methods.
- **e2e (Playwright+axe):** `graph.spec.ts` — stub `**/v1/graph` (+ `**/v1/effects*`); assert the toolbar/filters/stats render, switch to Effects mode shows the ranked list; **WCAG A/AA clean** (canvas mocked/inert is fine — the accessible alternative is the list).
- **Records:** `effects.json` (E-011 `queryGraph` + web consumer; E-002 graph/effects views realized; E-003 new `/v1/graph` + `query_graph` + regenerated SDK; E-004 React Flow view), `feature_list` F-043 → done, `progress.md`, memory lesson if one emerges (React-Flow-offline/LOD). Screenshot-verify `/graph` (Explore + Effects) live against the real API (scan this repo → a real symbol graph).

## Files to touch
- `packages/knowledge-graph/src/service/knowledge-graph-service.ts` (+ `.test.ts`); `index.ts` exports if needed.
- `apps/api/src/`: `schemas/graph.ts` (new), `routes/v1/graph.ts` (new), `routes/v1/index.ts`, `index.ts`, `*.test.ts` (e2e). SDK regen (`packages/sdk`).
- `apps/mcp/src/`: `gateway.ts`, `schemas.ts`, `server.ts`, `*.test.ts`.
- `apps/web/`: `lib/api/{types,client,hooks}.ts`, `lib/graph-layout.ts` (+ test), `components/graph/{graph-view,graph-canvas,graph-canvas-impl}.tsx` (+ tests), `app/graph/page.tsx`, `tests/e2e/graph.spec.ts`. `package.json` (+@xyflow/react).
- `.harness/state/{effects,feature_list,progress}`; memory.

## Anticipated effects
- **E-011** (KG): additive `queryGraph` on the service (store already supports it) + a new web consumer.
- **E-002** (KG/effect-link model): the graph & effects **web views realized** (was a stub in the effect graph).
- **E-003** (REST/MCP): new `GET /v1/graph` + `query_graph` tool → OpenAPI + regenerated SDK; web consumes it + `get_effects`.
- **E-004** (tokens/UI): a new token-consuming React Flow view (heavy, code-split).

## Test plan
- **Unit:** service `queryGraph` (nodes/edges/limit/subgraph-coherence/tenant); pure `toFlow` (layout/effect-styling/path-highlight/5k-budget); `graph-view` (chrome/modes/selection, canvas mocked); client methods.
- **e2e:** REST `GET /v1/graph` (fixture) + MCP `query_graph`; web `/graph` (Explore + Effects, axe clean).
- **Screenshot:** `/graph` Explore (a real scanned-repo subgraph) + Effects mode (paths highlighted + ranked list).

## Verification
`node scripts/verify-state.mjs` · `pnpm typecheck` · `pnpm lint` · `pnpm format:check` · `pnpm test` · `pnpm test:e2e` · `pnpm build` + screenshots. **Gate React Flow on a green `next build` in increment 2 before building the rest.**

## Risks / open questions
- **React Flow bundle + Next 16 (App Router, offline).** Mitigation: lazy `ssr:false` dynamic import + its CSS imported in the impl module; verify `next build` first. `@xyflow/react` is self-contained (no CDN).
- **Large-graph performance.** `onlyRenderVisibleElements` + a bounded API query (cap) + neighborhood expansion + a deterministic O(n) layout (no heavy layout lib). The 5k-node fixture proves the transform; a benchmarked gate is F-049.
- **Graph a11y.** A canvas isn't natively navigable → provide the ranked-list / node-list side panel as the **documented keyboard alternative**; keep all chrome axe-clean; canvas `aria-label` + reduced-motion.
- **Scope spans 4 packages** — but each change is small/additive (service passthrough, one REST route, one MCP tool, SDK regen); the weight is the web viz. No breaking changes; defaults unchanged.
