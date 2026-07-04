# Plan: F-039 — Live corpus indexing (ingested documents + captured memories populate the retrieval indices)

- **Feature:** F-039 (see [`../state/feature_list.json`](../state/feature_list.json)) · **Requirements:** FR-63, FR-8, FR-21, FR-22, FR-24, NFR-12
- **ADRs:** relates to ADR-0040 (runtime source management, the F-038 seam this fills), ADR-0006 (embedding model/dim per vector), ADR-0018 (config/Local profile), ADR-0033 (tenant isolation). No new ADR (a composition-root change inside the established seams).
- **Package:** `@tessera/config` (composition) + `@tessera/retrieval` (add `KeywordRetriever.remove`) · **Author:** Claude · **Date:** 2026-07-04
- **Verification:** typecheck · lint · test (keep format + build + e2e + state green)

## Intent
Make `search`/`compile` answer from the **user's actual repository**. F-038 makes scans run and lands documents in the blob corpus + extracts memories, but nothing feeds the retrieval indices — so the 2026-07-04 live check found a just-ingested/captured item unfindable. F-039 wires a **persistent indexing DocumentSink** (and a memory-indexing decorator) so ingested documents **and captured memories** populate the keyword (FTS5), temporal, and semantic (VectorStore) indices, through the tenant-scoped views. "Done" for a user: point Tessera at a repo, scan it, then `POST /v1/search` returns its files with multi-signal attribution and `POST /v1/compile` cites them.

## Approach / increments (each keeps gates green + is committed)

**Reused, not rebuilt:** the F-018 `KeywordRetriever.index`/`TemporalRetriever.index/remove`, the `VectorStore.upsert/delete` + `Embeddings.embed` (semantic), the `Runtime.keyword`/`Runtime.temporal` exposure + `stores.vector` + the blob `putFragment` corpus seam, the F-038 runtime sink `tee` + `SourceService`, the F-007 `MemoryService` + its `forTenant`. New code is one composition-root **corpus indexer** + two thin wrappers.

**Design — one `CorpusIndexer`, two writers.** A single tenant-aware indexer centralizes "make a `(ref, text)` retrievable", so ingestion and memory index through the *same* path and share one **ref space** (the fusion requirement — see [[hybrid-fusion-shared-ref-space]]):
- `indexDocument({ ref, text, kind, timestamp?, tenantId? })`: write the blob fragment (`putFragment`, so `compile` can cite it) **and** index it — `keyword.forTenant(t).index(ref, text)`, `temporal.forTenant(t).index(ref, timestamp ?? now)`, `embeddings.embed(text) → vector.forTenant(t).upsert([{ id: ref, vector, model }])`. **NFR-12 cache:** an in-memory `Map<'${t}:${ref}', sha256(text)>` short-circuits an unchanged `(ref, text)` so it is never re-embedded (belt-and-suspenders over the F-006 manifest, which already prevents re-processing unchanged documents upstream).
- `removeDocument({ ref, tenantId? })`: `blob.delete(ref)` + `keyword.forTenant(t).remove(ref)` + `temporal.forTenant(t).remove(ref)` + `vector.forTenant(t).delete([ref])` + drop the cache entry.

**Ref space (unchanged, consistent).** Ingested documents index under `document.id` (F-038, deterministic per `(source, path)`); captured memories index under `memory:{lineageId}`. Retrieval returns these refs; `createBlobFragmentSource` resolves them — so a search hit is always resolvable by the compiler.

**Chunking (documented).** F-039 indexes **whole documents** as one unit each (one fragment/keyword-row/temporal-row/vector per document/memory). Sub-document chunking (splitting a large file into chunk-refs, embedding the batch) is a documented future refinement that keeps this same sink seam — noted in the plan; `Embeddings.embedBatch` is the batching hook it would use.

### Increment 1 — the indexer + `KeywordRetriever.remove` + the indexing DocumentSink
- `@tessera/retrieval`: add `remove(ref)` to `KeywordRetriever` (FTS `DELETE ... WHERE ref = ? AND tenant = ?`) — additive; document removal needs it.
- `@tessera/config` `sources/corpus-indexer.ts` (new): `createCorpusIndexer({ blob, keyword, temporal, embeddings, vector })` as above.
- `sources/indexing-sink.ts`: replace `createBlobFragmentSink` with `createIndexingDocumentSink({ indexer })` — `upsert(doc)` (skip binary) → `indexer.indexDocument({ ref: doc.id, text: doc.text, kind: doc.kind, timestamp: documentTimestamp(doc) })`; `remove(ref)` → `indexer.removeDocument({ ref: documentIdFor(ref.sourceId, ref.path) })`. `documentTimestamp` prefers `metadata.modifiedAt` / `metadata.git.committedAt`, else now.
- Unit tests: indexer (index → keyword/temporal/vector all return the ref; content-hash cache skips re-embed via a counting fake embeddings; remove clears all three); tenant isolation (index in tenant A, absent in B).

### Increment 2 — memory indexing + runtime wiring
- `sources/memory-indexing.ts` (new): `createIndexingMemoryService(inner, indexer, tenantId?)` — a `MemoryService` decorator: `capture`/`edit` delegate then `indexer.indexDocument({ ref: 'memory:'+m.lineageId, text: m.title+'\n'+m.body, kind: 'memory', timestamp: m.createdAt, tenantId })`; `getCurrent`/`history`/`list` pass through; `forTenant(t)` returns a decorator bound to `t`.
- `profiles/local.ts`: build `vector`-aware `createCorpusIndexer`; runtime sink `tee(createIndexingDocumentSink(indexer), memoryExtractionSink)`; wrap `services.memory` (and the extraction sink's memory target) with `createIndexingMemoryService(memory, indexer)` so BOTH API/MCP captures and auto-extracted memories index. Keep the corpus/index writes in the default tenant for ingestion (F-038 scope); memory indexes in its capture tenant via the decorator's `forTenant`.
- Integration test (`@tessera/config`): boot the real Local runtime (fake embeddings), register + scan the fixture repo, then assert `search('authentication tokens')` returns the repo's `README.md`/files with multi-signal attribution **and** `compile` produces a budget-bounded package citing them; capture a memory via `services.memory` and assert `search` finds it; edit it and assert the index reflects the new body; re-scan is idempotent (no duplicate index rows / no re-embed).
- **Compile-cache staleness (acceptance 5):** the Local runtime does **not** enable the compilation cache (F-020), so index writes are immediately reflected — documented in the plan + a code comment; if a cache is later enabled it MUST key on a corpus version (the documented contract).

## Files to touch
- `packages/retrieval/src/adapters/keyword-retriever.ts` (+ its test) — `remove`.
- `packages/config/src/sources/corpus-indexer.ts` (new), `sources/indexing-sink.ts` (replaces `ingestion-sink.ts`'s blob-only sink), `sources/memory-indexing.ts` (new), `profiles/local.ts`, `index.ts`, tests under `src/sources/*.test.ts` + `tests/integration/`.
- `.harness/state/{feature_list,effects,progress}`; memory + index.

## Anticipated effects
- **E-012** (retriever contract): `KeywordRetriever.remove` added (additive).
- **E-008/E-012/E-013** (embeddings/retrieval/compiler): the indexer is a new **writer** of the keyword/temporal/vector indices + the blob corpus — the seam these contracts left for ingestion. Search/compile now return real ingested content.
- **E-014** (composition root): the Local profile gains the corpus indexer + the indexing sink + the memory-indexing decorator (extends F-038's E-021 wiring).
- **E-021** (source management): the runtime sink evolves from corpus-only to corpus+indices.
- **E-010** (memory): the composition wraps `MemoryService` with an indexing decorator (additive; the service contract is unchanged).

## Test plan
- **Unit:** `KeywordRetriever.remove`; `createCorpusIndexer` (index populates all three signals + the corpus; NFR-12 cache skips re-embed; remove clears all; tenant isolation); `createIndexingMemoryService` (capture/edit index; passthrough).
- **Integration (config):** the real Local runtime — scan a fixture repo → `search` + `compile` answer from it with attribution; capture/edit a memory → findable; idempotent re-scan; fake embeddings drive it (transformers env-guarded).
- **Regression:** F-038 integration + api/mcp e2e stay green (the sink now also indexes — `blob.list()` still 3, plus search now returns files).

## Verification
`node scripts/verify-state.mjs` · `pnpm typecheck` · `pnpm lint` · `pnpm format:check` · `pnpm test` · `pnpm test:e2e` · `pnpm build`. Confirm `@tessera/config` stays Fastify-free (no new api runtime import).

## Risks / open questions
- **Whole-document embedding is coarse** for large files — acceptable for F-039; chunking is the documented refinement (keeps the sink seam). 
- **Embedding cost / determinism** — the fake provider drives deterministic offline tests; real transformers stays env-guarded (F-005 pattern). The NFR-12 content-hash cache + the upstream manifest keep re-embedding out of the steady state.
- **Multi-tenant ingestion** — ingestion still indexes in the default tenant (F-038 boundary); memory indexes per capture tenant. Cross-tenant corpus reads are prevented because retrieval is tenant-scoped (a tenant never receives another tenant's refs), even though the blob corpus is a shared keyspace of unique refs — documented.
- **Compile cache** — not enabled in the Local runtime, so no staleness; the contract (key on corpus version) is documented for when it is.
