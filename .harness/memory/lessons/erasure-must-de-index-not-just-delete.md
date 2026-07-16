---
id: erasure-must-de-index-not-just-delete
kind: lesson
title: Deleting from the store isn't erasure — the retrieval corpus holds its own copy
links:
  - packages/config/src/sources/memory-indexing.ts
  - packages/config/src/sources/corpus-indexer.ts
  - packages/memory/src/service/retention.ts
  - apps/api/src/dsr/purge.ts
  - docs/adr/0049-data-governance-retention-dsr-mcp-audit.md
confidence: 0.95
created: 2026-07-16
---

**What happened:** F-047 added memory retention (FR-15) and DSR erasure (NFR-13). The obvious
implementation — `MemoryStore.deleteLineage()` — would have shipped a **fake erasure**: the memory row
goes, but the memory stays *searchable* and its text stays *servable*.

**Why:** indexing (F-039) copies each memory into a **separate ref space** — a blob corpus fragment
(what the compiler cites and serves as text) plus the keyword FTS, vector, and temporal indices, all
keyed `memory/<lineageId>`. The memory store is not the only place the content lives. A store-only
delete leaves every one of those copies intact, so `search`/`compile` still return the "erased" memory
and still hand back its body from the corpus blob. For a right-to-be-forgotten request that is not a
cosmetic bug — the bytes are still there and still being served.

**How to apply:**
- Route every deletion path through the layer that owns *all* the copies. Here that's the indexing
  `MemoryService` decorator (`createIndexingMemoryService`) — `deleteLineage` delegates **and** calls
  `indexer.removeDocument({ ref, tenantId })`. `ApiServices.memory` is the decorated service, so DSR
  purge and the retention pass both get de-indexing for free; a caller reaching past it to the raw
  store would not.
- **When a pass returns only counts, diff the state to learn what to clean up.** `pruneMemories`
  returns `{expiredLineages, prunedVersions}`, not ids — keeping ids out of the result keeps it a clean
  API response shape. The decorator instead snapshots the current lineage set before and after and
  de-indexes the difference. (Compaction of *superseded* versions needs no de-index: only the current
  version is ever indexed, under the lineage ref.)
- Generally: **before adding a delete to any port, grep for who else copied that data.** In this repo
  that's the corpus indexer; the same question applies to any future cache or projection.

**Corollaries from the same feature:**

- **Exports must be unbounded *by contract*, not by a big `limit`.** `queryGraph` caps at a display
  limit; reusing it for a DSR export would make completeness a matter of luck. Added
  `KnowledgeGraphService.exportAll()` (and `MemoryStore.exportAll()`) that are exhaustive by
  definition. A partial answer to a right-of-access request is a wrong answer.
- **Fastify response-type strictness depends on whether you passed route generics.** A route declared
  `app.get<{ Querystring: Q }>('/x', ...)` does **not** typecheck its handler return against the Zod
  response schema — which is why `/v1/memory` can `return { memories }` with a `readonly Memory[]`. A
  route declared without generics (`scoped.get('/x', {...}, handler)`) **does**, and then
  `readonly T[]` → `T[]` fails (TS4104/TS2322) — including *nested* readonly arrays like
  `Memory.metadata.links`. Don't conclude from the lenient route that readonly is fine; follow the
  house pattern (`routes/v1/tokens.ts`) and write an explicit `toWire*` projection that copies the
  arrays. Readonly *properties* are fine — only arrays break.
- **A new `AuditAction` ripples further than the union.** `AUDIT_ACTIONS` is `z.enum()`d into the
  `/v1/audit` query + event schemas ⇒ OpenAPI doc → `@tessera/sdk` regen → `apps/web`
  `lib/api/types.ts` mirror **and** `lib/governance.ts` `AUDIT_ACTION_LABELS`. The label map being
  `Record<AuditAction, string>` makes a missed label a typecheck failure — that tripwire is deliberate,
  keep it.
- **`verify-state` validates relative doc links.** ADR cross-references must use the real filename
  (four guessed-by-title links failed: e.g. `0034-audit-trail-and-governance.md`, not
  `0034-audit-trail-port-and-governance-surface.md`). `ls docs/adr/` before writing the references.

See [[audit-trail-via-onresponse-hook-and-port]] (the trail this extends) and
[[engineering-standards]].
