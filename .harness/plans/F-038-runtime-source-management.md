# Plan: F-038 — Runtime source management (ingestion wired into the shipped runtime + REST/MCP surface + SSE progress)

- **Feature:** F-038 (see [`../state/feature_list.json`](../state/feature_list.json)) · **Requirements:** FR-62, FR-6, FR-7 (+ FR-38 SSE)
- **ADRs:** **0040 (new — runtime source management: SourceRegistry + SourceService, the runtime ingestion worker, SSE bridge)**; relates to ADR-0015 (ingestion contracts), 0018 (config/profiles), 0030 (Fastify-free config), 0033 (tenant isolation), 0034 (audit), 0036 (agent-first parity)
- **Package:** `@tessera/ingestion` (ports + domain) + `@tessera/config` (composition) + `@tessera/api` (REST) + `@tessera/mcp` (tools) + `apps/server` (wiring) · **Author:** Claude · **Date:** 2026-07-04
- **Verification:** typecheck · lint · test · e2e (keep format + build + state green)

## Intent
Close the **#1 launch-readiness gap** (2026-07-04 review): `@tessera/ingestion` exists and is tested but is **not composed into the bootable runtime**, so a user cannot point Tessera at a repo and get context out. This feature makes ingestion **run inside the shipped Local runtime** and be **operable by an agent** — register a filesystem/git source, trigger a scan, watch progress over SSE — through **REST + MCP parity** (ADR-0036). "Done" for a user: an agent (no UI) registers a source, scans it (incremental + idempotent on re-run), and observes `document.ingested` + scan-lifecycle events on `GET /v1/events`. (Making the scanned documents **retrievable** — indices — is the paired F-039; here documents land in the corpus + memories are extracted + scans are controllable.)

## Approach / increments (each keeps gates green + is committed)

**Reused, not rebuilt:** the F-006 `Connector`/`Processor`/`DocumentSink`/`IngestionManifest` ports, `createIngestionCoordinator` + `createIngestionWorker` (queue-driven, incremental, redaction-terminal), `createFilesystem/GitConnector`, the F-017 `createMemoryExtractionSink` (ADR→memory), the config blob `putFragment` corpus seam, the F-021 `ApiEventBus` + `/v1/events` SSE route, the F-025 RBAC catalog + `requirePermission`/`tenantOf`, the F-027 `recordAudit` hook, the F-026 MCP gateway. New code is composition + a thin source surface.

**Three design problems solved (recorded in ADR-0040):**
1. **One connector per *source*, not per *kind*.** The worker resolves connectors by `source.kind` (fine for one fs connector). Multiple filesystem sources (different roots) need per-source resolution → add an **optional `connectorFor?(source): Connector | undefined` resolver** to `createIngestionWorker` (takes precedence over the `connectors` kind-map; existing callers/tests unchanged). The `SourceService` builds + caches a connector per registered source (by id) and feeds the resolver.
2. **Fire-and-forget queue vs a synchronous "scan → summary" call.** The in-process queue delivers on the microtask queue; `enqueue` does **not** await handlers. Add an **optional `drain?(): Promise<void>`** to the `Queue` port (await in-flight without stopping acceptance; in-process implements it, cloud/BullMQ may omit → async scan observed via SSE). `SourceService.scan()` awaits `queue.drain?.()` so the **Local** scan is synchronous-complete (deterministic tests + the agent-first proof).
3. **Shared event bus so the runtime worker feeds `/v1/events`.** The `Runtime` **owns** an `ApiEventBus` (built via `@tessera/core` `createEventBus<ApiEventMap>()` with a **type-only** `ApiEventMap` import — keeps `@tessera/config` Fastify-free, ADR-0030). Config **bridges** the ingestion `EventBus<IngestionEvents>` (document + scan-lifecycle events) → the `ApiEventBus` (small, non-sensitive summaries). `apps/server` passes `runtime.events` to `buildServer`.

### Increment 1 — ingestion ports + domain (`@tessera/ingestion`)
- `domain.ts`: extend `IngestionEvents` **additively** with `source.scan.started` / `source.scan.completed` (carrying `sourceId`, `kind`, `label`, and the `ScanSummary`).
- `sources/registry.ts` (new): `SourceRecord { id, kind, label, config: { root }, tenantId, createdAt }`, `RegisterSourceInput`, `SourceRegistry` port (`list/register/get/remove` + `forTenant(tenantId)`) + `createInMemorySourceRegistry` + a shared **conformance suite** (incl. cross-tenant isolation, ADR-0033).
- `sources/service.ts` (new): `SourceService` port (`list/register/get/remove/scan/scanStatus` + `forTenant`) + `createSourceService({ registry, queue, manifest, connectorFor, events? })`. It validates `kind ∈ SUPPORTED_SOURCE_KINDS` on register, caches connectors per source id (feeds the worker resolver), runs a scan via `createIngestionCoordinator` then `await queue.drain?.()`, tracks in-memory per-source `SourceScanStatus { state: idle|running|error, lastScan?, error? }`, and emits scan-lifecycle events.
- `pipeline/worker.ts`: add optional `connectorFor?` resolver (additive).
- `index.ts`: export the new modules. Tests: registry conformance (in-memory) + service unit (register→scan→idempotent re-scan→remove, invalid kind, tenant isolation) using in-process queue + in-memory manifest + a fake connector.

### Increment 2 — persistence + runtime wiring (`@tessera/config`)
- `sources/sqlite-source-registry.ts` (new): `createSqliteSourceRegistry(db)` over the Drizzle handle (`sources` table: `id`, `tenant_id`, `kind`, `label`, `config` JSON, `created_at`; `forTenant` filter/stamp) — passes the same conformance suite.
- `sources/sqlite-manifest.ts` (new): `createSqliteManifest(db)` (`ingestion_manifest(source_id, path, content_hash)` PK(source_id,path)) — durable incremental scans across restarts. (Manifest is keyed by globally-unique source id → no tenant column needed; isolation is gated by the registry.)
- `schema.ts`: `sources` section (`autoScanOnRegister?: boolean` default false; extension seam). `load.ts`: `TESSERA_SOURCES_*` env if any (document in `.env.example`).
- `runtime.ts`: `Runtime` gains `events: ApiEventBus` + `sources: SourceService`; `ApiServices` (in `@tessera/api`) gains optional `sources?`.
- `profiles/local.ts`: build the event bus; build `createSqliteSourceRegistry` + `createSqliteManifest`; wire the **runtime sink** = `teeSink(blobFragmentSink, memoryExtractionSink(memory))` (documents → corpus via `putFragment`; ADRs/settled items → memories); start **one** `createIngestionWorker` (queue, `connectorFor` from the source service, sink, manifest, ingestion events); subscribe a **bridge** ingestion-events → `ApiEventBus`; construct `createSourceService` with a `connectorFor(record)` mapping `filesystem→createFilesystemConnector`, `git→createGitConnector`; expose `services.sources`, `runtime.events`, `runtime.sources`; `close()` also unsubscribes the worker + bridge.
- Tests: integration — boot the Local runtime (`:memory:` + fake embeddings), register a real filesystem source at a temp fixture dir, scan → assert `ScanSummary` + that `ApiEventBus` received `source.scan.started`/`document.ingested`×N/`source.scan.completed`; re-scan with no change → `unchanged`, 0 new events (idempotent); edit a file → 1 `modified`.

### Increment 3 — REST surface (`@tessera/api`)
- `auth/model.ts`: add `sources:read` (to `READ_PERMISSIONS`) + `sources:manage` (member+ in `ROLE_PERMISSIONS`).
- `audit/model.ts`: add `source.read` + `source.manage` to `AUDIT_ACTIONS`.
- `services.ts`: `ApiServices.sources?` typed via a **type-only** import of `SourceService` from `@tessera/ingestion` (new acyclic type edge; add the dep).
- `schemas/sources.ts` (new): Zod for register body, source record, scan summary, scan status, list response, id param.
- `routes/v1/sources.ts` (new): `GET /v1/sources` (`sources:read`), `POST /v1/sources` (`sources:manage`), `GET /v1/sources/:id` (`sources:read`), `DELETE /v1/sources/:id` (`sources:manage`), `POST /v1/sources/:id/scan` (`sources:manage`), `GET /v1/sources/:id/scan` (status, `sources:read`) — each `config.audit`-flagged, `forTenant(tenantOf(request))`; a `requireSources(services)` helper throws a clean `InternalError` when unconfigured (doc-gen/`buildServer({})`). Register in `routes/v1/index.ts`.
- `index.ts`: export the sources schemas + the new permission/action names. Regenerate `@tessera/sdk` (`scripts/generate.mjs` + `pnpm --filter @tessera/sdk build`).
- Tests: e2e (real fs fixture via a fake/in-memory `SourceService`, or the real service over a temp dir) — register→list→get→scan(summary)→status; `sources:manage` 403 for a viewer; unconfigured→500 envelope; OpenAPI lists the routes.

### Increment 4 — MCP tools (`@tessera/mcp`)
- `gateway.ts`: extend `McpToolName` + `TOOL_PERMISSIONS` with `add_source→sources:manage`, `list_sources→sources:read`, `scan_source→sources:manage`.
- `schemas.ts` + `server.ts`: register `add_source` / `list_sources` / `scan_source` wrapping `services.sources.forTenant(tenantOf(ctx))` (same guard pattern as the five existing tools; token-lean structured results).
- Tests: unit (gateway permissions) + e2e over `InMemoryTransport` — a member registers + scans a temp fixture source; a viewer is denied `add_source` (FORBIDDEN); `list_sources` allowed.

### Increment 5 — parity rule application + records
- The ADR-0036 parity rule already lives at [`../rules/common/agent-first.md`](../rules/common/agent-first.md); this is its **first enforced application** (every op ships REST + MCP). Write **ADR-0040**; update the ADR index. Update `effects.json` (E-009/E-014/E-003/E-018/E-020 + a new **E-021** source-management contract), `feature_list.json` (F-038 → done with notes), `progress.md`, `.env.example` if new env, and memory (a lesson on the connector-per-source resolver + drain barrier). `apps/server`: pass `runtime.events` to `buildServer`.

## Files to touch
- `packages/ingestion/src/`: `domain.ts`, `pipeline/worker.ts`, `sources/registry.ts` (new), `sources/service.ts` (new), `sources/*.test.ts` (new), `index.ts`.
- `packages/storage/src/ports/queue.ts` (+ `adapters/in-process-queue/index.ts`) — optional `drain?()`.
- `packages/config/src/`: `schema.ts`, `load.ts`, `runtime.ts`, `profiles/local.ts`, `index.ts`, `sources/sqlite-source-registry.ts` (new), `sources/sqlite-manifest.ts` (new), `sources/*.test.ts` (new), an `ingestion-sink.ts` corpus sink (new).
- `apps/api/src/`: `auth/model.ts`, `audit/model.ts`, `services.ts`, `schemas/sources.ts` (new), `routes/v1/sources.ts` (new), `routes/v1/index.ts`, `index.ts`, `*.test.ts` (e2e). `apps/api/package.json` — add `@tessera/ingestion` (type dep).
- `apps/mcp/src/`: `gateway.ts`, `schemas.ts`, `server.ts`, `*.test.ts`.
- `apps/server/src/api.ts` (pass `runtime.events`); `packages/sdk` regen.
- `docs/adr/0040-*.md` + index; `.harness/state/{feature_list,effects,progress}.json/md`; `.env.example` (if new env); memory + index.

## Anticipated effects
- **E-009** (ingestion contracts): `IngestionEvents` gains scan-lifecycle keys (additive); worker gains `connectorFor` (additive); the `SourceRegistry`/`SourceService` are new ingestion contracts → **new E-021**.
- **E-014** (config composition root): the Local profile now constructs the ingestion worker + registry + manifest + source service + shared event bus — the runtime-ingestion seam realized.
- **E-003** (REST/MCP contracts): new `/v1/sources*` routes + `add_source`/`list_sources`/`scan_source` tools → OpenAPI + regenerated SDK; `/v1/events` gains the ingestion producer.
- **E-018** (auth): new `sources:read`/`sources:manage` permissions + MCP `TOOL_PERMISSIONS`.
- **E-020** (audit): new `source.read`/`source.manage` actions recorded.
- **E-007** (storage ports): `Queue` gains optional `drain?()` (additive; adapters that omit it are unaffected).

## Test plan
- **Unit:** registry conformance (in-memory + sqlite, incl. cross-tenant isolation); `SourceService` (register/scan/idempotent-rescan/modified/remove/invalid-kind/tenant-scoping) with a fake connector; MCP gateway `TOOL_PERMISSIONS`.
- **Integration (config):** boot the real Local runtime, register a filesystem source at a temp fixture, scan → `ScanSummary` + `ApiEventBus` receives scan-lifecycle + `document.ingested` events; re-scan idempotent; sqlite registry/manifest persist across a re-open.
- **E2E:** REST (register→list→get→scan→status; viewer 403 on manage; unconfigured→500; OpenAPI) + MCP (member registers+scans a fixture; viewer denied `add_source`) + an SSE assertion that a scan streams a `document.ingested` event to a connected `/v1/events` client over a live socket.

## Verification
`node scripts/verify-state.mjs` · `pnpm typecheck` · `pnpm lint` · `pnpm format:check` · `pnpm test` · `pnpm test:e2e` · `pnpm build`. **Plus** confirm `@tessera/config` + the MCP runtime stay **Fastify-free** (only the type-only `ApiEventMap`/`SourceService` imports; grep the built graph) and the default (no-source) surfaces are byte-for-byte unchanged.

## Risks / open questions
- **Fastify-free config invariant** — mitigated by importing `ApiEventMap` + `SourceService` **type-only** and building the bus via `@tessera/core`; verify config's runtime `@tessera/api*` imports are only `/auth`.
- **Filesystem-path source config is powerful** (reads arbitrary paths). Fine for the single-user **Local** profile; hosted/multi-tenant must add an allowlist + admin-gating — a **documented seam** (note in ADR-0040). Registration is gated by `sources:manage` (member+) and audited.
- **Scan completion semantics** — synchronous-complete only where `queue.drain?()` exists (Local/in-process); cloud/async scan is observed via `scanStatus` + SSE. Documented.
- **Worker connector resolution ordering** — the service caches a source's connector *before* the coordinator enqueues its events, and the in-process queue schedules jobs synchronously within `enqueue`, so the resolver always finds the connector. Covered by the idempotency integration test.
- **Corpus vs indices boundary** — F-038 lands documents in the blob corpus + extracts memories; it does **not** populate keyword/semantic/temporal indices (that is F-039), so `search` won't yet return ingested files. Called out so the boundary isn't mistaken for a regression.
