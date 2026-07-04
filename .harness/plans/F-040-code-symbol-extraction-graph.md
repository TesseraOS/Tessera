# Plan: F-040 — Code-symbol extraction → live knowledge-graph population + static effect-links + manual assertion surface

- **Feature:** F-040 (see [`../state/feature_list.json`](../state/feature_list.json)) · **Requirements:** FR-63, FR-16, FR-18, FR-19 · **Resolves:** OQ5
- **ADRs:** **0041 (new — OQ5 → tree-sitter WASM)**; relates to ADR-0008 (graph), 0015 (ingestion), 0033 (tenancy), 0036 (parity), 0040 (runtime ingestion)
- **Package:** `@tessera/ingestion` (port + sink) + `@tessera/config` (tree-sitter adapter + wiring) + `@tessera/knowledge-graph` (`removeNode`) + `@tessera/api` (POST /v1/effects) + `@tessera/mcp` (assert_effect) · **Author:** Claude · **Date:** 2026-07-04
- **Verification:** typecheck · lint · test · e2e (keep format + build + state green)

## Intent
Populate the knowledge graph from real code so `GET /v1/effects` returns **real ranked dependents** on the
user's repository (FR-16/18/19) — the product's #2 differentiator, currently empty in production. An
ingestion extractor turns each ingested source file into `file`/`symbol` nodes + `imports`/`defines`
edges; the existing static-derivation inverts imports into `EFFECT_LINK`s; and an agent can assert
effect-links manually via `POST /v1/effects` + an `assert_effect` MCP tool. Toolchain = **tree-sitter
(WASM)**, TS/JS first (ADR-0041, probe-verified offline).

## Approach / increments (each keeps gates green + is committed)

**Reused, not rebuilt:** the F-008 `KnowledgeGraphService` (`upsertNode`/`upsertEdge`/`assertEffectLink`/
`deriveStaticEffectLinks`/`getEffects`), the static-derivation inversion (imports/calls/references →
`EFFECT_LINK`), the F-006 pipeline + manifest (only changed files reach the sink), the F-017
structural-seam pattern (declare a minimal service interface in ingestion, no cross-package dep), the
F-038/F-039 runtime sink `tee`, the F-025 RBAC + F-027 audit + F-022 SDK regen.

### Increment 1 — `GraphStore.removeNode` (additive; enables incremental subgraph replacement)
- `@tessera/knowledge-graph`: add `removeNode(id)` to the `GraphStore` port (deletes the node + all
  incident edges, idempotent) + the in-memory + SQLite adapters + a conformance case; expose
  `KnowledgeGraphService.removeNode` (or keep it store-level + a service `removeFileSubgraph` helper — TBD
  in code, prefer the smallest surface). Tests: remove clears the node + its edges; effect traversal no
  longer returns it.

### Increment 2 — extractor port + graph-extraction sink (`@tessera/ingestion`, deterministic/offline)
- `symbols/extractor.ts`: `SymbolExtractor` port (`extract(document) → ExtractedGraph`), `ExtractedGraph`
  types (`{ files, symbols, imports }` — plain refs/keys, no graph-package dep), and a **structural**
  `GraphWriteService` (upsertNode/upsertEdge/removeNode subset the real `KnowledgeGraphService` satisfies).
- `adapters/graph-extraction-sink.ts`: `createGraphExtractionSink({ extractor, graph })` — a `DocumentSink`
  that, on `upsert(document)` for a code file, **replaces** the file's subgraph (removeNode the file +
  its `"<path>#…"` symbols via a listed lookup) then inserts the extracted nodes/edges; `remove(ref)`
  drops the file's subgraph. Import specifiers resolve relative → source-relative target path.
- Tests: a deterministic fake `SymbolExtractor` drives the sink — file/symbol nodes + import edges land;
  re-index with a removed import drops the stale edge (incremental correctness); `get_effects` on a fake
  graph returns the importer.

### Increment 3 — tree-sitter adapter + runtime wiring (`@tessera/config`)
- `symbols/tree-sitter-extractor.ts`: `createTreeSitterSymbolExtractor()` — lazy `Parser.init()` + load
  the TS/JS/TSX grammar `.wasm` (resolved from `tree-sitter-wasms`), a `Query` for imports + top-level
  decls, mapping to `ExtractedGraph`; language chosen by file extension; non-code/binary → empty. New deps
  `web-tree-sitter` + `tree-sitter-wasms`.
- `profiles/local.ts`: add `createGraphExtractionSink({ extractor, graph })` to the runtime sink `tee`;
  after a scan, call `graph.deriveStaticEffectLinks()` (via the source service's scan completion, or the
  sink) so effect-links are derived. Expose nothing new on `Runtime` (graph is already in `services.graph`).
- Integration test (`@tessera/config`): scan a fixture repo (a file importing another) → `GET`-equivalent
  `services.graph.getEffects({kind:'file', key:'<dep>'})` returns the importer with a path; re-scan
  idempotent. `web-tree-sitter` runs offline; if grammar-load proves environment-flaky, env-guard the
  live extraction test (F-005 pattern) — but the deterministic sink test (inc 2) always runs.

### Increment 4 — manual assertion surface (REST + MCP parity)
- `@tessera/api`: `effects:write` permission (RBAC catalog) + `effects.write` audit action; `POST /v1/effects`
  (assert an effect-link: from/to node refs + rationale + confidence + origin=`manual`) → `assertEffectLink`;
  schema → OpenAPI; regenerate `@tessera/sdk` (+ client method). `@tessera/mcp`: `assert_effect` tool +
  gateway `TOOL_PERMISSIONS` (`effects:write`). e2e: assert via REST + MCP, then `get_effects` returns it;
  viewer denied (403/FORBIDDEN).

### Increment 5 — records
- Update `effects.json` (E-011 removeNode + graph population writer; E-002/E-003/E-018/E-020), `feature_list`
  (F-040 → done), `progress.md`, memory; ADR index (0041). NOTICE.md for the new OSS deps
  (web-tree-sitter/tree-sitter-wasms licenses).

## Files to touch
- `packages/knowledge-graph/src/ports/graph-store.ts` (+ adapters + conformance + service).
- `packages/ingestion/src/symbols/*` (new) + `adapters/graph-extraction-sink.ts` (new) + `index.ts` + tests.
- `packages/config/src/symbols/tree-sitter-extractor.ts` (new) + `profiles/local.ts` + `index.ts` + `package.json` (deps) + tests.
- `apps/api/src/{auth/model,audit/model,schemas/effects,routes/v1/effects}.ts` + `index.ts`; `packages/sdk` regen.
- `apps/mcp/src/{gateway,schemas,server}.ts` + tests.
- `docs/adr/0041-*.md` + index; `NOTICE.md`; `.harness/state/*`; memory.

## Anticipated effects
- **E-011** (graph contract): `GraphStore.removeNode` added (additive) → both adapters + conformance.
- **E-002/E-011** (graph population): ingestion is a new **writer** of graph nodes/edges (the OQ5 seam) →
  `get_effects` returns real dependents.
- **E-014/E-021** (composition): the runtime sink gains the graph-extraction sink + tree-sitter adapter.
- **E-003** (REST/MCP): `POST /v1/effects` + `assert_effect` → OpenAPI + SDK.
- **E-018/E-020**: `effects:write` permission + `effects.write` audit action.

## Test plan
- **Unit/conformance:** `GraphStore.removeNode` (in-memory + sqlite); graph-extraction sink with a fake
  extractor (nodes/edges land; removed import → stale edge dropped); tree-sitter extractor (parses a TS
  snippet → expected files/symbols/imports).
- **Integration (config):** scan a fixture repo → `get_effects(depFile)` returns the importer with a path;
  idempotent re-scan.
- **E2E:** `POST /v1/effects` + `assert_effect` (REST + MCP), then `get_effects` returns it; viewer denied.

## Verification
`node scripts/verify-state.mjs` · `pnpm typecheck` · `pnpm lint` · `pnpm format:check` · `pnpm test` ·
`pnpm test:e2e` · `pnpm build`. Confirm `@tessera/ingestion` stays free of `web-tree-sitter`/graph-package
runtime deps (structural seam); confirm the WASM extractor runs offline.

## Risks / open questions
- **WASM grammar loading in Node/vitest** — de-risked by the probe (parsed TS offline); resolve grammar
  `.wasm` paths from the `tree-sitter-wasms` package dir; env-guard only the *live* extraction integration
  test if the environment proves flaky (the deterministic sink tests never depend on WASM).
- **Import resolution** — only relative specifiers resolve to file nodes (bare/package imports → `module`
  nodes or skipped); documented in ADR-0041.
- **Incremental correctness** — the subgraph-replace (removeNode file + its symbols) handles removed
  imports/symbols; the manifest handles "only changed files".
- **Scope discipline** — file/symbol/import edges only; intra-file call graphs + deeper semantics are
  documented refinements behind the same `SymbolExtractor` port.
