# Plan: F-081 Source scans as async jobs — real progress, honest state, a request that returns

- **Feature:** F-081 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-62, FR-6, FR-7, NFR-2
- **Service / package:** `@tessera/ingestion` → `@tessera/api` → `@tessera/sdk` → `apps/web`
- **Author:** Claude (Opus 4.8) · **Date:** 2026-07-17

## Intent

User items 11/12/14: *"scanning is going on without any expected time, have progressbar"*, *"source
scanning blocks the API service, this should be async"*, *"handle source scan response, state"*.

Done means: triggering a scan returns immediately, the dashboard shows a **determinate** progressbar
driven by real counts, and every terminal state (completed / failed / already-running) is surfaced.

## The defect, confirmed in code

[`sources/service.ts`](../../packages/ingestion/src/sources/service.ts) `performScan()` awaits
`coordinator.scan()` **and** `await queue.drain?.()`, and the route awaits `performScan`. The F-038
doc comment says so out loud — *"so a Local scan is synchronous-complete"*. That was a defensible
choice for a Local profile (the returned summary reflects fully-processed work); it stops being
defensible once the same process serves a dashboard, because the caller holds an HTTP request open
for the entire ingest.

**Items 11 and 12 are one defect with two faces:** there is no progress *data* anywhere — not merely
no progressbar. Nothing counts processed-vs-total, so no honest bar can be drawn today.

## Approach — additive, so nothing that works today breaks

**`scan()` keeps its current synchronous semantics.** MCP's `scan_source`
([`server.ts:339`](../../apps/mcp/src/server.ts)) does `const { source, summary } = await
scoped.scan(id)` and returns the summary — an *agent* genuinely wants "scan and tell me what
changed". Making `scan()` async would silently degrade that to "started; poll elsewhere". So:

1. **Add `startScan(id)`** to `SourceService`, returning as soon as the job is *accepted*.
   `scan(id)` stays (MCP + `autoScanOnRegister` + existing tests untouched); both share the same
   `performScan` internals, so there is exactly one scan implementation.
2. **Track progress.** `coordinator.scan()` already computes `added/modified/removed` — that sum is
   the **total** (the work actually enqueued; `unchanged` is not work). Count **processed** by
   observing the ingestion bus (`document.ingested` / `document.removed`) filtered to this source,
   and emit a throttled `source.scan.progress { sourceId, processed, total }`.
3. **Reject a concurrent scan** of a source already `running`, rather than racing two coordinators
   over one manifest.
4. **Surface background failure.** The request that started the job is gone by the time it fails, so
   the error must land in `scanStatus` **and** on the stream, never swallowed.
5. **REST:** `POST /v1/sources/:id/scan` → **202** + current state; `GET /v1/sources/:id/scan`
   reports `queued|running(progress)|idle|error`.
6. **Web:** determinate progressbar from `processed/total`; explicit queued / failed / already-running
   states.

## Files to touch

- `packages/ingestion/src/sources/service.ts` — `startScan`, progress tracking, running-guard.
- `packages/ingestion/src/domain.ts` — `source.scan.progress` event.
- `apps/api/src/events.ts` — bridge the progress event (tenant-scoped, ADR-0050).
- `packages/config/src/profiles/local.ts` — bridge wiring.
- `apps/api/src/schemas/sources.ts` + `routes/v1/sources.ts` — 202 + status shape.
- `packages/sdk` — the changed POST response.
- `apps/web` — sources view: progressbar + states.

## Anticipated effects

- **E-003 (REST/MCP contract) — the live one.** `POST /v1/sources/:id/scan` changes from
  `200 {source, summary}` to `202 {source, state}`: the summary *cannot* be returned by a request
  that no longer waits for it. Dependents: OpenAPI (auto), **SDK**, **dashboard**, and the e2e
  (`sources.spec.ts`). **MCP is deliberately unaffected** — it keeps calling `scan()`.
- **E-020 (audit)** — the audited action still fires at request time (`source.manage`); it records
  that a scan was *requested*, which stays true.
- `ScanState` gains `queued`; every `switch` over it must handle it (TypeScript will point at them).

## Test plan

- **Unit (ingestion):** `startScan` returns before the queue drains (assert with a blocking sink);
  progress reaches `processed === total`; a failing job lands `state: 'error'` **with the message**
  rather than rejecting nothing; a second `startScan` while running is rejected; `scan()` still
  resolves with the summary (the MCP contract).
- **Integration (api):** POST returns 202 without waiting; GET reports running→idle; the progress
  event is tenant-filtered on the stream.
- **Regression:** `packages/ingestion` (15 files) + MCP tests must stay green untouched — the whole
  point of keeping `scan()`.
- **Web:** determinate bar from real counts; failed and already-running render honestly.

## Verification

Gates: `state`, `typecheck`, `lint`, `format`, `test`, `build`, plus `sources.spec.ts`.

## Risks / open questions

- **The progress signal is the weak point.** Counting `document.*` per source is inference, not
  ledgering: a `removed` event and an `ingested` event both count 1, and a doc whose hash is
  unchanged emits *nothing* while still being "processed" — so a naive counter can stall below
  total. Either count only what the coordinator enqueued (and have the worker emit a
  per-job "done" regardless of outcome), or accept a bar that can finish early and say so. **Do not
  ship a bar that silently sticks at 90%.**
- `autoScanOnRegister` must keep using `scan()` (await) — registration returning before its own scan
  starts would be a worse lie than the one being fixed.
- **Out of scope, deliberately:** the worker-thread pool is **F-085** (measured: embedding holds the
  main thread — mean loop delay 32.9ms vs a 36.1ms on-thread control and 16.7ms offloaded).
  Multi-process clustering stays out entirely (in-process bus + status map; F-056 is the
  prerequisite). This feature makes the *request* non-blocking; it does not make the *process*
  parallel, and the wording must not imply otherwise.
