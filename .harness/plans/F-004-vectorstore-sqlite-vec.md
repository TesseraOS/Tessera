# Plan: F-004 — VectorStore port + sqlite-vec adapter

- **Feature:** F-004 · **Requirements:** FR-21 · **ADRs:** 0003, 0006
- **Package:** `@tessera/storage` · **Author:** Claude · **Date:** 2026-06-28

## Intent
Add the semantic-retrieval storage primitive: a `VectorStore` port + a local **sqlite-vec**
adapter, each vector tagged with its **embedding model id + dimension** so we can re-embed /
migrate models without corrupting the index (ADR-0006). pgvector implements the same port for
cloud later.

## Port (`src/ports/vector.ts`)
- `VectorStoreCapabilities { metric: 'l2'|'cosine'; dimension: number }`.
- `VectorItem { id; vector: number[] (len === dimension); model: string }`.
- `VectorMatch { id; distance: number; model: string }`.
- `VectorStore { capabilities; upsert(items); query(vector, k): VectorMatch[]; delete(ids); close() }`.

## Adapter (`src/adapters/sqlite-vec/index.ts`)
- `createSqliteVecStore({ path, dimension, model, metric? })`.
- better-sqlite3 + load the **sqlite-vec** extension; `CREATE VIRTUAL TABLE ... USING vec0(...)`
  keyed by id with a `model` column; upsert/query/delete via vec0 KNN (`MATCH`/`ORDER BY distance`).
- Validates incoming vector length === dimension (ValidationError from @tessera/core).

## De-risk first (Windows native/extension load)
Before writing the adapter, install `sqlite-vec` and smoke-test: load the extension into
better-sqlite3, create a vec0 table, insert + KNN query. Confirms the API + Windows support;
adjust if the load path/syntax differs. (Mirrors the driver de-risk in F-003.)

## Layout (ADR-0014)
`src/ports/vector.ts`; `src/adapters/sqlite-vec/index.ts`; export from `src/index.ts`.
`tests/conformance/vector.conformance.ts` + `tests/integration/sqlite-vec.test.ts` (temp/`:memory:`).

## Anticipated effects
VectorStore joins the storage ports → covered by **E-007** (storage port ⇒ adapters +
conformance). Consumed later by retrieval (F-009) + ingestion embedding writes (F-006).

## Test plan
Vector conformance: upsert then query returns nearest by distance; respects k; delete removes;
rejects wrong-dimension vectors; records/returns model. Adapter integration runs it on `:memory:`.

## Verification
typecheck · lint · format:check · test · build (cache off → fresh); verify-state; evidence → progress.

## Risks
- sqlite-vec extension load on Windows (verify in smoke test; fallback: brute-force cosine in
  SQL or a pure-TS fallback adapter if the extension won't load — but prefer sqlite-vec).
- vec0 column/syntax varies by version — pin to the installed version's API after the smoke test.
