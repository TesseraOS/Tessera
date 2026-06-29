# Plan: F-007 — Memory subsystem (@tessera/memory)

- **Feature:** F-007 · **Requirements:** FR-10, FR-11, FR-12, FR-13 · **ADRs:** 0003, 0005
- **Package:** `@tessera/memory` (new) · **Author:** Claude · **Date:** 2026-06-29
- **Verification:** typecheck · lint · test (keep format + build green)

## Intent
A first-class, **versioned** memory store: typed memory **kinds** with **metadata**, **never
silently mutated** (edits create a new superseding version; prior versions are immutable), and a
domain **service** for create/edit that REST (F-011) and MCP (F-012) will expose — the "via API +
MCP" seam. Local-first persistence via the storage SQLite/Drizzle handle (ADR-0003/0005).

## Domain (`src/domain.ts`)
- `MEMORY_KINDS = ['decision','lesson','incident','failure','architecture','glossary','task']`;
  `MemoryKind = (typeof MEMORY_KINDS)[number]` (FR-10).
- `MemoryId = Id<'Memory'>` (per **version**), `MemoryLineageId = Id<'MemoryLineage'>` (stable identity).
- `MemoryMetadata { source?, author?, links?[], tags? }` (FR-11; timestamps/scope/confidence are
  first-class fields per ARCHITECTURE §5).
- `Memory { id, lineageId, kind, title, body, scope, confidence, metadata, version, supersedes,
  supersededBy, createdAt }`. **Current** = the lineage version with `supersededBy === null`.

## Validation (`src/validation.ts`, Zod — NFR-1, ADR-0002)
- `captureMemorySchema` (kind, title, body, scope?=‘global’, confidence?=1.0, metadata?) and
  `editMemorySchema` (all optional patch). Inferred input types (`z.infer`) are the one source of
  truth. Bounds: non-empty title/body, `confidence ∈ [0,1]`. Constants named (no magic).

## Port (`src/ports/memory-store.ts`)
`MemoryStore { add(memory); supersede(previousId, next) /*atomic*/; getById; getCurrent(lineageId);
listVersions(lineageId); listCurrent(filter?{kind?,scope?}) }`. `supersede` inserts the new version
**and** sets the previous version’s `supersededBy` in one atomic step — never edits content.

## Service (`src/service/memory-service.ts`) — the API/MCP-facing facade (FR-13)
`createMemoryService(store)` → `capture(input)`, `edit(lineageId, patch)`, `getCurrent(lineageId)`,
`history(lineageId)`, `list(filter?)`. Validates inputs (Zod), assigns ids/version/timestamps,
builds immutable `Memory` versions, and calls `add`/`supersede`. `edit` = load current → build
version N+1 (`supersedes` = current.id) → `store.supersede(current.id, next)`. NotFound on unknown
lineage.

## Adapters (`src/adapters/`)
- `in-memory-memory-store.ts` — Map-based reference; drives the conformance suite.
- `sqlite-memory-store.ts` — Drizzle `sqliteTable` (`memories`) over the storage `SqliteStore.db`;
  `init()` runs `CREATE TABLE IF NOT EXISTS` (drizzle-kit migrations are F-024’s job, not this one);
  `supersede` wrapped in `db.transaction(...)` for atomicity. JSON metadata column.

## Tests (ADR-0014; intra-package imports via `../../src`)
- Unit (co-located): `memory-service.test.ts` (capture→version 1; edit→version 2 supersedes,
  prior immutable + supersededBy set; history ordering; current reflects latest; NotFound),
  `validation.test.ts` (rejects empty/invalid; applies defaults).
- `tests/conformance/memory-store.conformance.ts` — every adapter: add/getById; getCurrent;
  supersede makes the new version current and the old one non-current without mutating its body;
  listVersions ordered; listCurrent filters by kind/scope.
- `tests/integration/in-memory-memory-store.test.ts` + `sqlite-memory-store.test.ts` (the latter
  builds a `:memory:` SqliteStore from @tessera/storage, runs conformance + a service-over-sqlite
  round-trip proving persistence + versioning).

## Scope (acceptance is the contract)
- **In:** kinds + metadata, version lineage + superseding (immutability), capture/edit service,
  in-memory + sqlite stores, conformance + tests.
- **Out (downstream):** REST/MCP wiring (F-011/F-012 wrap this service); auto-extraction (FR-14, R1);
  retention/expiry (FR-15, R2); cross-lineage supersede edges + embedding/search of memories
  (knowledge-graph F-008 / retrieval F-009); drizzle-kit migration tooling (F-024).

## Dependencies
`@tessera/core`, `@tessera/storage`, `drizzle-orm` (^0.45, match storage), `zod` (^3). No new
native deps (better-sqlite3 stays storage’s; the sqlite memory store takes storage’s `db` handle).

## Anticipated effects
New `@tessera/memory` + `MemoryStore` port → new effect **E-010** (MemoryStore port ⇒ its adapters +
conformance + the memory service; downstream consumers F-008/F-009/F-011/F-012). Concrete instance
of E-001 (a storage-backed port with a conformance suite).

## Risks
- Versioning atomicity → `supersede` is one atomic store op (sqlite: transaction).
- New deps (zod, drizzle-orm direct) → pinned, justified (ADR-0002/0005); verify install + typecheck.
