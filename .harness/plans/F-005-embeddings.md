# Plan: F-005 — Embeddings port + adapters (@tessera/ai)

- **Feature:** F-005 · **Requirements:** FR-21 · **ADRs:** 0003, 0006
- **Package:** `@tessera/ai` (new) · **Author:** Claude · **Date:** 2026-06-28

## Intent
Provide the `Embeddings` port + a local-default **Transformers.js** adapter (zero external
services/keys), an optional **Ollama** adapter, and a deterministic **fake** adapter for fast,
network-free tests (and for other packages to depend on). Behind the port so the embedding
backend is swappable (ADR-0006).

## Port (`src/ports/embeddings.ts`)
- `EmbeddingModelInfo { model: string; dimension: number }`.
- `Embeddings { info; embed(text): Promise<number[]>; embedBatch(texts): Promise<number[][]> }`.

## Adapters
- **`fake`** (`createFakeEmbeddings({ dimension, model? })`): deterministic hash-based vectors,
  normalized. Pure, no deps — drives the conformance suite (fast/offline) and other packages' tests.
- **`transformers`** (`createTransformersEmbeddings({ model? })`): `@huggingface/transformers`
  feature-extraction pipeline, mean-pooled + normalized. Async create (loads model → dimension).
  Default model: a small `all-MiniLM-L6-v2`-class (384-d). Downloads model on first use (cached).
- **`ollama`** (`createOllamaEmbeddings({ model, baseUrl? })`): HTTP `POST /api/embeddings` to a
  local Ollama. Optional; requires a running daemon.

## Testing (ADR-0014)
- `tests/conformance/embeddings.conformance.ts`: contract — embed returns `dimension`-length finite
  vector; embedBatch returns N vectors; deterministic (same text → same vector, toBeCloseTo).
- `tests/integration/fake-embeddings.test.ts`: runs conformance against `fake` — **always** (fast).
- `tests/integration/transformers.test.ts` + `ollama.test.ts`: run conformance against the real
  adapters but **guarded/skipped by default** (model download / daemon). Enabled via env
  (`TESSERA_TEST_TRANSFORMERS=1`, `TESSERA_TEST_OLLAMA=1`).

## De-risk first
Install `@huggingface/transformers`; smoke-test a real embed with a small model (downloads ~25MB)
to confirm it works + the output dimension/API, before finalizing the adapter. If the download is
blocked/slow here, implement correctly and rely on fake-based conformance + the guarded test (user
runs once to cache the model) — documented honestly.

## Anticipated effects
New `@tessera/ai` package + `Embeddings` port → effect **E-008** (Embeddings port ⇒ its adapters +
conformance). Consumed by ingestion (F-006) + retrieval (F-009).

## Verification
typecheck · lint · format:check · test (fast: fake conformance) · build, all fresh (cache off);
verify-state; evidence → progress.

## Risks
- Model download (network/size) — mitigated: fake adapter for gates; real adapter test guarded.
- Transformers.js ESM/types + Node 22 compatibility — verify at typecheck/smoke.
