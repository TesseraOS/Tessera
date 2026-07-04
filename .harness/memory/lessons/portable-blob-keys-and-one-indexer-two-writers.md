---
id: portable-blob-keys-and-one-indexer-two-writers
kind: lesson
title: Keep blob keys colon-free (NTFS ADS); index ingestion + memory through one shared indexer for a single ref space
links:
  - packages/config/src/sources/corpus-indexer.ts
  - packages/config/src/sources/memory-indexing.ts
  - packages/config/src/sources/ingestion-sink.ts
  - packages/storage/src/adapters/filesystem-blob/index.ts
confidence: 0.9
created: 2026-07-04
---

**What happened (F-039):** closing the core loop meant making both **ingested documents** and **captured
memories** retrievable. Two things mattered:

1. **A blob key with a `:` is a Windows footgun.** The filesystem `BlobStore` maps a key to a file path.
   A ref like `memory:<lineageId>` becomes `<root>/memory:<lineageId>`, which on **NTFS is an alternate
   data stream** of a base file `memory` — `put`/`get` round-trip (via the stream) but `readdir`/`list()`
   returns only `memory`, so a `list()`-based filter silently miscounts. (Existing tests used `doc:auth`
   refs and "worked" only because they never call `list()`.) **Fix:** use `/`-delimited, colon-free refs
   (`memory/<lineageId>`) — a portable nested path. When a value is both an index key and a filesystem
   name, keep it filesystem-safe (no `:`, `\`, `*`, `?`, `<`, `>`, `|`).

2. **One indexer, one ref space.** Fusion only combines signals when every retriever indexes under the
   **same ref** (see [[hybrid-fusion-shared-ref-space]]). Rather than let ingestion and memory each write
   the keyword/temporal/vector indices their own way, centralize "make `(ref, text)` retrievable" in a
   single tenant-aware `createCorpusIndexer` (blob corpus + FTS + temporal + embed→VectorStore, with a
   content-hash cache so unchanged text is never re-embedded, NFR-12). Ingestion uses it via a
   `DocumentSink`; memory uses it via a **`MemoryService` decorator** (`capture`/`edit` delegate then
   index under `memory/<lineageId>`; reads pass through; `forTenant` rebinds both). Both share the ref
   space, so a search hit always resolves in the compiler.

**Also:** the manifest (F-006) already prevents re-processing unchanged documents, so the indexer's
content-hash cache is belt-and-suspenders — but it makes NFR-12 hold for the memory path too (which has
no manifest) and for any direct re-index. Prove "never re-embeds" with a **counting fake embeddings** in
the unit test.

**How to apply:** when a ref doubles as a filesystem name, keep it colon/separator-free and verify
`list()` (not just get/put). When two producers must feed the same retrieval indices, give them one
shared indexer (a `DocumentSink` for the pipeline, a service decorator for the direct API) so they can't
drift into separate ref spaces. Cross-link: [[synchronous-scan-over-fire-and-forget-queue-and-per-source-connector]].
