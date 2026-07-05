---
id: tree-sitter-wasm-extraction-and-incremental-graph
kind: lesson
title: Probe a WASM toolchain before committing; make derived-edge graphs incrementally correct with surgical removeEdges
links:
  - packages/config/src/symbols/tree-sitter-extractor.ts
  - packages/ingestion/src/adapters/graph-extraction-sink.ts
  - packages/knowledge-graph/src/ports/graph-store.ts
  - docs/adr/0041-code-symbol-extraction-tree-sitter.md
confidence: 0.9
created: 2026-07-04
---

**What happened (F-040):** populate the knowledge graph from real code so `get_effects` returns real
dependents. Two things were decisive:

1. **Probe a heavy/native/WASM toolchain in the actual environment BEFORE planning around it.** OQ5 chose
   tree-sitter (WASM). Rather than assume it runs under Node/vitest/turbo, a scratchpad probe installed
   `web-tree-sitter` + `tree-sitter-wasms` and parsed TypeScript offline (extracting imports + symbols via
   a `Query`) first. Only then did the ADR commit to it. Prebuilt grammar `.wasm` (`tree-sitter-wasms/out`)
   + `web-tree-sitter` = offline, no native build, multi-language. Resolve grammar paths from the package
   dir (`require.resolve('tree-sitter-wasms/package.json')`), lazy `Parser.init()`, and cache the
   parser+query per language.

2. **A graph with DERIVED edges (effect-links from imports) is only incrementally correct with surgical
   edge removal.** The manifest re-processes only *changed* files, so a naive `removeNode(file)` on
   re-index is WRONG — it clobbers incoming import edges from *unchanged* files (which will never be
   re-added). The fix: on re-index, `removeEdges({ from: fileNode })` (clear the file's OUTGOING structural
   edges — a removed import can't linger) + `removeEdges({ to: fileNode, kind: EFFECT_LINK })` (clear its
   stale incoming derived links), then re-insert and re-derive. Incoming *structural* edges from other
   files are preserved, so their effect-links re-derive correctly. `removeNode` (node + all incident edges)
   stays the primitive for true deletion. Add both as general `GraphStore` methods (+ conformance).

**Also:** two seam patterns paid off again — the extractor's `GraphWriteService` is declared
**structurally** in `@tessera/ingestion` (literal node/edge-kind subsets so the real `KnowledgeGraphService`
is assignable) so ingestion takes no `@tessera/knowledge-graph` runtime dep ([[auto-extraction-structural-memory-seam]]);
and the parser lives behind a `SymbolExtractor` port so the WASM adapter sits in the composition root while
the deterministic sink logic is tested with a fake extractor (no WASM in the unit tests).

**Gotcha:** import specifiers omit extensions (`'./b'`), so make **file node keys extensionless** too
(`b.ts` → `b`) — otherwise import edges never connect to file nodes. Keep the full path on label/metadata.

**How to apply:** for any new heavy toolchain, probe-then-decide. For an incrementally-maintained graph
with derived edges, prefer surgical `removeEdges(filter)` over `removeNode` so you don't destroy edges the
current pass won't rebuild. Put parsers behind a port; test the graph logic with a deterministic fake.
