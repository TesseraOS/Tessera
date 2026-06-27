# ADR-0006: Embeddings runtime & vector store

- **Status:** Accepted
- **Date:** 2026-06-27
- **Deciders:** Project lead, Claude
- **Tags:** retrieval, storage, ai

## Context

Hybrid retrieval ([ADR-0004](0004-context-compilation-over-naive-rag.md)) needs vector
embeddings and a similarity index. Two constraints dominate: (1) **local-first** means
a developer must get semantic search with **zero external API keys and no cloud calls**;
(2) **cloud-ready** means the same code scales to a managed Postgres deployment. We must
also keep model choice swappable, because embedding models improve quickly.

## Decision

**Embeddings — local by default, hosted optional, always behind an `Embeddings` port:**

- **Default (local, in-process):** **Transformers.js** running a small, strong
  open model (e.g. a `bge-small`/`gte-small`-class or `all-MiniLM` model) — no native
  build, no daemon, works on the developer's machine out of the box.
- **Optional local runtime:** **Ollama**, for users who already run it or want larger
  local models / GPU acceleration.
- **Optional hosted providers** (OpenAI / Cohere / Voyage / etc.) for cloud deployments
  that prefer managed embeddings — selected by deployment profile, never required.

**Vector store — one logical port, two adapters following [ADR-0003](0003-local-first-cloud-ready-ports-and-adapters.md):**

- **Local:** **sqlite-vec** (vector search inside the same SQLite file — nothing else
  to run).
- **Cloud / self-hosted:** **pgvector** on PostgreSQL (HNSW/IVFFlat indexes).

Embedding **dimension and model id are recorded per stored vector** so we can migrate
models without corrupting the index, and re-embed incrementally.

## Consequences

### Positive
- True zero-dependency local semantic search; no keys, no network.
- Smooth scale-up path (SQLite+sqlite-vec → Postgres+pgvector) with no domain changes.
- Model-agnostic: swap embedding models behind the port; provenance records the model.

### Negative / Costs
- In-process JS embeddings are slower than a GPU service for large backfills; mitigated
  by batching, caching, and the optional Ollama/hosted adapters.
- Maintaining parity between sqlite-vec and pgvector query semantics needs a conformance
  suite.

### Neutral / Follow-ups
- Re-embedding/migration job when the default model changes (versioned embeddings).
- Benchmark candidate default models before first release; the choice above is the
  starting default, not a permanent lock.

## Alternatives considered

- **Dedicated vector DBs (Qdrant / Weaviate / Milvus / pinecone)** — excellent at scale,
  but add an always-on service that breaks the zero-dependency local promise. Supported
  later as **optional** adapters, not the default.
- **Mandatory hosted embeddings (OpenAI, etc.)** — simplest to integrate, but requires
  keys and network, violating local-first. Kept optional only.

## References

- [ADR-0003](0003-local-first-cloud-ready-ports-and-adapters.md),
  [ADR-0004](0004-context-compilation-over-naive-rag.md), [ADR-0005](0005-orm-drizzle.md).
