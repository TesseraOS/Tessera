# ADR-0041: Code-symbol extraction with tree-sitter (WASM) — resolves OQ5

- **Status:** accepted
- **Date:** 2026-07-04
- **Feature:** F-040 (R3) · **Requirements:** FR-63, FR-16, FR-18, FR-19 · **Resolves:** OQ5
- **Relates to:** ADR-0008 (knowledge graph), ADR-0015 (ingestion contracts / dependency-light), ADR-0033 (tenant isolation), ADR-0036 (agent-first parity), ADR-0040 (runtime ingestion)

## Context

The knowledge graph (F-008) and `get_effects` (F-019) are real service capabilities but are **empty in
production**: nothing extracts code symbols/imports to populate `GraphStore` nodes/edges, so the
product's #2 differentiator ("what breaks if this changes") is unreachable by users. **OQ5** asked which
toolchain should extract symbols: **tree-sitter vs LSP vs the TypeScript compiler API**. The PRD
direction is **local-first, multi-language, TS/JS first-class**.

## Decision

Adopt **tree-sitter via WebAssembly** (`web-tree-sitter` + prebuilt grammar `.wasm` from
`tree-sitter-wasms`), TS/JS first, other languages added by dropping in grammars.

**Why tree-sitter (WASM):**
- **Multi-language** by design (one parser, many grammars) — matches the PRD direction; the TS compiler
  API is TS/JS-only, and LSP needs a running language-server process per language (heavy, not local-first).
- **Local-first + offline + no native build.** The WASM grammars are prebuilt assets; no `node-gyp`, no
  network, no server processes — consistent with the project's dependency-light stance (ADR-0015/0024).
- **Fast + incremental** parsing; robust on partial/invalid code (an editor-grade parser).

**Verified before deciding:** a probe installed `web-tree-sitter@0.25` + `tree-sitter-wasms@0.1` and, fully
offline, parsed TypeScript and extracted `import` sources (`./foo`, `../bar`), function/class names, and
exported consts via a tree-sitter `Query`. The toolchain runs in this Node/vitest environment.

**Extraction model (maps to the F-008 graph).** For each ingested source file the extractor emits:
- a `file` node (key = source-relative path);
- `symbol` nodes for top-level declarations (functions/classes/interfaces/exported consts), key
  `"<path>#<name>"`, with a `file --defines--> symbol` edge (`defines` is structural, **not** inverted);
- `file --imports--> file` edges, resolving relative import specifiers to a source-relative target path
  (dependency edge → **inverted** by the existing `deriveStaticEffectLinks` into
  `EFFECT_LINK` edges, FR-18).

So `GET /v1/effects(file)` returns the **real** ranked importers/dependents on the fixture repo — the
differentiator becomes live product behavior.

**Incremental (FR-63).** The F-006 manifest already ensures only **changed** files reach the sink. To keep
a changed file's subgraph correct (e.g. a removed import), the sink **replaces** the file's subgraph: it
deletes the file node + its `<path>#…` symbol nodes (and their incident edges) before re-inserting. This
needs one **additive** `GraphStore.removeNode(id)` (cascading incident edges) — see below.

**Seam & placement.** Mirroring the F-017 memory-extraction seam: the `SymbolExtractor` **port** +
`ExtractedGraph` types + the `createGraphExtractionSink` (a `DocumentSink` writing through a **structural**
`GraphWriteService` — declared in `@tessera/ingestion`, so no dependency on `@tessera/knowledge-graph` and
no cycle) live in `@tessera/ingestion`. The **tree-sitter adapter** (`web-tree-sitter` + grammar assets)
lives in the composition root `@tessera/config` (which already carries heavy deps), keeping
`@tessera/ingestion` dependency-light and the parser swappable.

**Manual assertion surface (ADR-0036 parity).** `POST /v1/effects` (assert an effect-link with
rationale/confidence/origin=`manual`) + an `assert_effect` MCP tool, RBAC-guarded (new `effects:write`) and
audited (new `effects.write` action), wrapping the existing `KnowledgeGraphService.assertEffectLink`.
OpenAPI + the generated SDK regenerate.

## Consequences

- `get_effects` returns real dependents in production; the graph is populated by scans.
- **Additive contract changes:** `GraphStore.removeNode` (port + in-memory + SQLite + conformance, E-011);
  new `effects:write` permission (E-018) + `effects.write` audit action (E-020); `POST /v1/effects` +
  `assert_effect` (E-003). New deps `web-tree-sitter` + `tree-sitter-wasms` on `@tessera/config`.
- **Documented seams:** call/reference edges (F-040 does file/symbol/import; intra-file call graphs are a
  refinement), non-relative/package import resolution (only relative specifiers resolve to file nodes;
  bare specifiers become `module` nodes or are skipped), multi-language beyond TS/JS (add grammars),
  multi-tenant ingestion graph scoping (ingestion populates the default tenant, per ADR-0040), and a
  deeper semantic layer (types/cross-file symbol resolution) if ever needed (the TS compiler API remains
  available behind the same `SymbolExtractor` port for a TS-fidelity backend).

## Alternatives considered

- **TypeScript compiler API** — deepest TS semantics but TS/JS-only; rejected as the primary because it
  can't carry the multi-language direction. Kept viable behind the `SymbolExtractor` port for a future
  high-fidelity TS backend.
- **LSP servers** — broad coverage but requires per-language server processes; rejected as not local-first
  / too heavy for the embedded runtime.
