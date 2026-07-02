---
id: auto-extraction-structural-memory-seam
kind: lesson
title: A cross-package producer→consumer step stays dependency-free via a structural seam + an additive sink decorator
links:
  - packages/ingestion/src/adapters/memory-extraction-sink.ts
  - packages/ingestion/src/extraction/candidate.ts
  - packages/ingestion/tests/integration/auto-memory-extraction.test.ts
  - docs/adr/0024-github-connector-and-auto-memory-extraction.md
confidence: 0.9
created: 2026-07-02
---

**What happened:** F-017's automatic memory extraction (FR-14) has to take an ingested
`ProcessedDocument` (`@tessera/ingestion`) and write a captured `Memory` (`@tessera/memory`). The
obvious wiring — `ingestion` importing `memory` — adds a package dependency for one small feature.
Three choices kept it clean:

1. **Structural seam instead of a package import.** The extraction sink declares a minimal local
   `MemoryCaptureService` interface (`capture`/`edit`/`list`) rather than importing
   `@tessera/memory`. The real `MemoryService` is assignable to it, so composition (config/server)
   passes it in — but `@tessera/ingestion` gains **no runtime dependency and no cycle**. Same family
   as the type-only surface imports ([[composition-root-type-only-and-fake-provider]],
   [[mcp-twin-surface-type-only-and-inmemory-e2e]]); here it's a *structural* subset (no import at
   all) because even a type-only import would need the package on the dependency graph. Cost: a small
   duplicated `CandidateMemoryKind` union that must track `MEMORY_KINDS`.

2. **Additive `DocumentSink` decorator, not a worker change.** Extraction is a new `DocumentSink`
   (`createMemoryExtractionSink`) composed with a persistence sink via `teeSink(...)`, so the F-006
   worker contract (E-009) is untouched. Adding behavior over verified code as a decorator/wrapper —
   the same move as [[observability-additive-otel-api-in-libs]] — beats threading it through the core.

3. **Idempotency keyed on a stable `source` id.** Every candidate carries `metadata.source`
   (`adr:NNNN` / `github:owner/repo#n`). On re-ingest the sink looks it up and **skips if identical,
   supersedes if changed, captures if absent** — never duplicating, even across manifest resets.

**How to apply:**
- When package A must feed package B for one feature, ask whether A needs to *depend* on B or merely
  produce B's input shape. If the latter, declare a **structural interface** for B's slice and let the
  composition root wire the real thing — keep the dependency graph acyclic and the feature testable
  with a faithful in-memory fake.
- Add cross-cutting behavior over a verified pipeline as an **additive decorator** composed at the
  seam, not by editing the core stage/worker.
- Any auto-generated record needs a **deterministic idempotency key** so re-runs supersede/skip rather
  than pile up duplicates.
