# ADR-0040: Runtime source management — ingestion wired into the shipped runtime

- **Status:** accepted
- **Date:** 2026-07-04
- **Feature:** F-038 (R3) · **Requirements:** FR-62, FR-6, FR-7, FR-38
- **Relates to:** ADR-0015 (ingestion contracts), ADR-0018 (config/Local profile), ADR-0030 (Fastify-free composition root), ADR-0033 (tenant isolation), ADR-0034 (audit), ADR-0036 (agent-first parity)

## Context

The engine (`@tessera/ingestion`: filesystem/git connectors, the incremental content-hash
pipeline, secret redaction, ADR→memory extraction) existed and was well-tested, but was **not
composed into the bootable runtime** (the 2026-07-04 launch-readiness review's #1 gap). There was no
`/v1/sources` surface, no MCP source tools, and no ingestion worker in `createLocalRuntime`. A user
could not point Tessera at a repository and get context out; the whole product thesis was unreachable.

## Decision

Wire ingestion into the Local runtime and expose it through **REST + MCP parity** (ADR-0036), behind
a small domain surface. Three design problems were solved:

1. **A `SourceService` domain surface, tenant-scoped.** `@tessera/ingestion` gains a `SourceRegistry`
   port (in-memory + a persistent SQLite adapter in `@tessera/config`) and a `SourceService`
   (`list/register/get/remove/scan/scanStatus` + `forTenant`). Sources are **registered at runtime**
   (not statically configured), isolated per tenant (ADR-0033) — a tenant only sees/scans its own.

2. **One connector per *source*, not per *kind*.** The F-006 worker resolved connectors by
   `source.kind`, which cannot serve two filesystem roots. `createIngestionWorker` gains an optional
   `connectorFor(source)` resolver (kind-map fallback preserved); the `SourceService` caches a
   connector per registered source and feeds the resolver. The composition root supplies the
   `connectorFactory` (it knows the available kinds: filesystem, git) — so unsupported kinds surface as
   a clean 400/VALIDATION, with **no api↔config catalog duplication**.

3. **A synchronous scan over a fire-and-forget queue.** The in-process `Queue` delivers on the
   microtask queue; `enqueue` does not await handlers. We add an **optional `Queue.drain()`** (await
   in-flight without stopping acceptance; in-process implements it, distributed adapters may omit it).
   `SourceService.scan()` awaits `queue.drain?.()`, so a Local scan is **synchronous-complete** (its
   `ScanSummary` reflects fully-processed work — deterministic tests + the agent-first proof); cloud
   adapters observe progress via `scanStatus` + SSE instead.

**Composition (`createLocalRuntime`).** The runtime builds one ingestion worker over the `Queue`,
wired to a **runtime sink = tee(blob-corpus sink, memory-extraction sink)**: ingested documents land
in the compiler corpus (persistence) and ADRs/settled items become memories (F-017). Scan-lifecycle +
document events flow on an ingestion `EventBus`, **bridged** to a shared `ApiEventBus` so scans stream
`document.ingested`/`source.scan.*` on `GET /v1/events` (FR-38). The `ApiEventMap`/`SourceService`
types are imported **type-only** (the bus is built via `@tessera/core`), so `@tessera/config` — and the
MCP process booting through it — **stay Fastify-free** (ADR-0030).

**Surfaces (ADR-0036 parity).** REST `/v1/sources` (list/register/get/remove + `POST :id/scan` +
`GET :id/scan` status) and MCP `add_source`/`list_sources`/`scan_source` wrap the **same** service. A
new `sources:read` (all read roles) + `sources:manage` (member+) permission gates them; new
`source.read`/`source.manage` audit actions record every call; tenancy stays off the wire.

**Boundary with F-039.** F-038 lands documents in the blob corpus + extracts memories; it does **not**
populate the keyword/semantic/temporal retrieval indices (that is F-039). So `search` does not yet
return ingested files — the boundary is deliberate, not a regression.

## Consequences

- The core loop is **closed in the running product**: an agent (REST or MCP, no UI) registers a repo,
  scans it (incremental + idempotent), and observes progress — proven end-to-end offline.
- `Queue` gains an optional `drain()` (additive; adapters that omit it are unaffected). `IngestionEvents`
  + the worker's `connectorFor` are additive. `MemoryService`'s capture input now accepts `readonly`
  arrays so the real service satisfies the F-017 structural seam on first composition.
- **Documented seams:** multi-tenant *ingestion pipeline* scoping (the registry is tenant-isolated, but
  the shared worker/corpus write in the default tenant — correct for the single-tenant Local profile);
  filesystem-path source config is powerful and must be admin-gated + allowlisted for hosted/multi-tenant
  (registration is gated by `sources:manage` + audited); retrieval-index population (F-039); a distributed
  queue's async scan model; the web Sources UI (F-041); the RBAC-catalog web mirror drift (F-046).

## Alternatives considered

- **Auto-scan on a filesystem watcher** instead of explicit `scan`: deferred — an agent deciding *when*
  to scan is the agent-first model; a `config.sources.autoScanOnRegister` knob covers the convenience case.
- **Threading tenant through every ChangeEvent/ProcessedDocument** to scope the corpus per tenant now:
  rejected for F-038 (larger contract change) — the registry gates cross-tenant access and the Local
  profile is single-tenant; index-level tenant scoping is handled where it bites (F-039, the stores'
  `forTenant`).
