---
id: synchronous-scan-over-fire-and-forget-queue-and-per-source-connector
kind: lesson
title: Back a synchronous scan over a fire-and-forget queue with an optional drain(), and resolve connectors per-source
links:
  - packages/ingestion/src/sources/service.ts
  - packages/ingestion/src/pipeline/worker.ts
  - packages/storage/src/adapters/in-process-queue/index.ts
  - packages/config/src/profiles/local.ts
  - docs/adr/0040-runtime-source-management.md
confidence: 0.9
created: 2026-07-04
---

**What happened:** F-038 composed the F-006 ingestion pipeline (coordinator enqueues change events → a
worker consumes them from the `Queue` port) into the runtime and exposed a `scan()` that must return a
`ScanSummary` reflecting *fully processed* work (deterministic tests + the agent-first proof). Two frictions
surfaced when composing verified pieces for the first time:

1. **The in-process queue delivers on the microtask queue — `enqueue` does NOT await handlers.** So after
   `coordinator.scan()` returned, the worker might not have persisted anything yet; a synchronous
   "scan → summary" call over a fire-and-forget queue is a mismatch.
2. **The worker resolved connectors by `source.kind`**, which cannot serve two filesystem sources with
   different roots.

**The fixes (both additive, no breaking change):**
- Add an **optional `Queue.drain(): Promise<void>`** (await in-flight without stopping acceptance; the
  in-process adapter implements it, distributed adapters may omit it). `SourceService.scan()` awaits
  `queue.drain?.()`, making a **Local** scan synchronous-complete; cloud/async adapters observe progress via
  `scanStatus` + SSE instead. Prove the barrier by asserting the sink is fully populated the instant
  `scan()` resolves — NOT by asserting SSE event ordering (the interleave of `document.ingested` vs
  `source.scan.completed` on a shared bus is timing-sensitive; assert set membership, not the last element).
- Add an **optional `connectorFor(source)` resolver** to the worker (kind-map fallback preserved); the
  `SourceService` caches a connector per registered source (by id) and feeds the resolver. Because the
  service caches the connector *before* the coordinator enqueues that source's events, and the in-process
  queue adds jobs to its in-flight set synchronously within `enqueue`, the resolver always finds it.

**Also (a latent seam biting on first composition):** a structural seam only *claimed* to be satisfiable
until something actually composes it. F-017's `MemoryCaptureService` seam was never wired to the real
`MemoryService` until F-038; it then failed typecheck because the capture input inferred mutable `string[]`
while `CandidateMemory` used `readonly string[]`. Fix at the root by making the input accept `readonly`
(`z.array(...).readonly()`) — strictly more permissive. **Lesson:** when a "the real service is assignable"
claim is never exercised, treat it as unverified; wiring it for real is the test.

**How to apply:** to turn a fire-and-forget queue into a synchronous barrier, add an optional `drain()` and
have the caller await it where present; keep it optional so distributed adapters stay async. To let one
long-lived worker serve many sources of the same kind, resolve connectors per-source via an injected
resolver, not a kind map. See [[reuse-cross-surface-contract-type-only-to-avoid-runtime-coupling]] for the
type-only `ApiEventMap`/`SourceService` imports that kept `@tessera/config` Fastify-free while building the
shared `ApiEventBus` via `@tessera/core`.
