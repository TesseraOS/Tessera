# Plan: F-009 — Hybrid retrieval + fusion ranker (@tessera/retrieval)

- **Feature:** F-009 · **Requirements:** FR-21, FR-22, FR-23, FR-25, FR-26 · **ADRs:** 0003, 0004, 0006
- **Package:** `@tessera/retrieval` (new) · **Author:** Claude · **Date:** 2026-06-29
- **Verification:** typecheck · lint · test (keep format + build green)

## Intent
Retrievers behind one common `Retriever` interface — **semantic** (VectorStore), **keyword/FTS**
(SQLite FTS5), **graph** (knowledge-graph traversal), **symbolic** (exact symbol lookup) — combined
by a **fusion ranker** (configurable per-signal weights, per-candidate signal attribution) into one
ranked candidate set (FR-21/22/23/25/26, ARCHITECTURE §8).

> **The "five retrievers" in the acceptance vs requirements:** F-009's requirements are
> FR-21/22/23/25/26 (semantic, keyword, graph, symbolic, fusion) — **temporal (FR-24) is R1/F-018**
> and is *not* in scope. We ship the four R0 retrievers behind the interface; temporal slots in as
> the fifth behind the same `Retriever` contract when F-018 lands. (Recorded so the discrepancy is
> intentional, not an omission.)

## Domain (`src/domain.ts`)
`RETRIEVER_KINDS = ['semantic','keyword','graph','symbolic']`; `RetrievalQuery {text, limit?}`;
`Candidate {ref, signal, score, label?}` (ref = id in a shared corpus space; score informational,
higher=better; retrievers return candidates **ordered best-first**). Fusion types:
`SignalContribution {signal,rank,score,weight,contribution}`, `FusedCandidate {ref,score,signals[],label?}`.

## Fusion (`src/fusion/fuse.ts`, the core — FR-26, pure)
**Weighted Reciprocal Rank Fusion** (rank-based, so heterogeneous retriever scores need no
normalization): each candidate at 1-based rank `r` for signal `s` contributes `weight[s] * 1/(k+r)`
(`k` default 60). Sum per `ref`; record each signal's contribution (**attribution**). Sort by fused
score desc, tie-break ref asc; apply `limit`. Configurable `weights` (a 0 weight drops a signal).

## Port (`src/ports/retriever.ts`)
`Retriever { kind; retrieve(query): Promise<readonly Candidate[]> }` — candidates ordered best-first,
all tagged with the retriever's `kind`, honoring `query.limit`.

## Text util (`src/util/text.ts`)
`extractTerms(text)` → lowercased identifier tokens (`\p{L}\p{N}_`), deduped — shared by keyword
(FTS MATCH, quoted to avoid FTS syntax injection), graph, and symbolic.

## Retrievers (`src/adapters/`)
- `semantic-retriever.ts` (`{embeddings, vectorStore}`): embed query → `vectorStore.query(vec, limit)`;
  ref = match id, ordered by ascending distance, score = `1/(1+distance)`.
- `keyword-retriever.ts` (`{db, table?}`): owns an **FTS5** virtual table; `index(ref, content)` to
  populate; retrieve via `MATCH` ordered by `bm25`. (Ingestion populates the index in production.)
- `graph-retriever.ts` (`{graphStore, ...}`): lexical-seed nodes by key/label term match, then
  **expand via `getEffects`** to surface dependents (FR-23); dedupe best-per-ref.
- `symbolic-retriever.ts` (`{graphStore}`): exact (score 1) / prefix (0.5) match on `symbol` node
  keys/labels (FR-25).

## Service (`src/service/hybrid-retriever.ts`) — API/MCP-facing
`createHybridRetriever(retrievers, options?)` → `search(query)`: Zod-validate query, run all
retrievers in parallel (`Promise.all`), `fuse` results → one ranked `FusedCandidate[]` with attribution.

## Tests (ADR-0014; intra-package imports via `../../src`)
- Unit: `fuse.test.ts` (RRF math, weights incl. 0-drop, attribution, ordering/limit), `text.test.ts`.
- `tests/conformance/retriever.conformance.ts` — interface invariants (kind tag, limit, empty-query) run per retriever.
- Integration: `semantic-retriever.test.ts` (fake embeddings + sqlite-vec, same-text nearest),
  `keyword-retriever.test.ts` (FTS5 over a `:memory:` SqliteStore), `graph-symbolic-retriever.test.ts`
  (in-memory graph store), `hybrid-retriever.test.ts` (multiple signals fuse for a shared ref;
  attribution present; weights change ranking).

## Scope (acceptance is the contract)
- **In:** 4 retrievers behind one interface (keyword=FTS, semantic=VectorStore) + fusion ranker
  (weights + attribution) + hybrid service returning one ranked set.
- **Out:** temporal retriever (FR-24, F-018/R1); the compiler's expand/dedup/compress/assemble
  (F-010); populating the corpus (ingestion wires a consistent `ref` space across backends — F-006
  extract/embed processors + config); learned ranking.

## Dependencies
`@tessera/core`, `@tessera/storage`, `@tessera/ai`, `@tessera/knowledge-graph`, `drizzle-orm` (FTS sql),
`zod`. No new native deps (FTS5 ships in better-sqlite3; sqlite-vec already present).

## Anticipated effects
New `@tessera/retrieval` + `Retriever`/fusion contracts → new effect **E-012** (Retriever interface +
fusion ⇒ retrievers + conformance + consumers: context compiler F-010, API/MCP search F-011/F-012).
Consumes E-007 (VectorStore), E-008 (Embeddings), E-011 (GraphStore).

## Risks
- FTS5 availability in better-sqlite3 → verified by the keyword integration test (CREATE VIRTUAL TABLE).
- Cross-backend `ref` consistency for meaningful fusion → out of scope here (ingestion/config seam);
  fusion is tested with retrievers sharing a ref space. Noted honestly.
