# Fix — api e2e tests encode the pre-F-081 synchronous scan contract

- **Author:** Claude (Opus 4.8) · **Date:** 2026-07-18
- **Type:** bug fix (stale tests), not a feature — no `F-` id.

## Symptom

`pnpm --filter @tessera/api test:e2e` is red on `main` (commit 8317407), two failures, one root:

- `tests/e2e/stats.e2e.test.ts` → "reports real counts after a scan and a captured memory":
  `stats.documents` is `0`, expected `2`.
- `tests/e2e/sources.e2e.test.ts` → "registers, lists, gets, scans …": `POST …/scan` returns `202`,
  the test expects `200` **with a `summary`**.

## Root cause

**F-081 pt2** (commit 3b1fd13) deliberately changed `POST /v1/sources/:id/scan` from **synchronous**
(`200 {source, summary}`, awaiting the coordinator *and* `queue.drain()`) to **asynchronous**
(`202 {source, state}` via `SourceService.startScan`, scan runs in the background). This is the
intended contract — documented in `apps/api/src/schemas/sources.ts` (`scanAcceptedResponseSchema`)
and the route comment. The summary now arrives via `GET /v1/sources/:id/scan` (`lastScan`) or the
`source.scan.completed` event.

The F-081 plan listed the e2e as a dependent of this E-003 contract change, but only the **web**
Playwright spec (`apps/web/tests/e2e/sources.spec.ts`) was updated. The two **api-side** e2e tests
above were left encoding the old synchronous contract:

- `stats.e2e` fires the scan and reads `/v1/stats` in the same tick, before the background scan has
  populated the manifest → `documents: 0`.
- `sources.e2e` asserts `200`+`summary`, which the async route no longer returns.

**F-085 (embedding worker pool) is not involved.** It lives entirely in `packages/ai` +
`packages/config`; the e2e composition root (`tests/e2e/support/in-memory-services.ts`) uses a
keyword retriever + `createInMemoryDocumentSink` + `createInProcessQueue` — no `packages/ai`, no
worker threads (`grep worker_threads|piscina` across the tree is empty). Documents are counted from
the ingestion **manifest**, updated synchronously by the in-process worker; the only variable is
*whether the background scan has finished* when stats is read.

## Fix (tests only — production code is correct)

1. New support helper `tests/e2e/support/await-scan.ts` → `awaitScan(app, sourceId, headers?)`:
   polls `GET /v1/sources/:id/scan` until `state !== 'running'` and returns the terminal status.
   This awaits the **real completion signal**, not a fixed delay (no timeout padding). Bounded by a
   poll ceiling so a genuinely stuck scan fails loudly instead of hanging the suite.
2. `stats.e2e.test.ts`: `await awaitScan(app, source.id)` after the scan POST, before reading stats.
3. `sources.e2e.test.ts`: assert the async contract — `202`, `state: 'running'`, no `summary`; then
   `await awaitScan(...)` and assert the summary on `lastScan`.

## Verification

Api gates: `typecheck`, `lint`, `format:check`, `test` (unit), `build`, and `test:e2e` (the two
failing tests + the other 97 stay green). Then repo `verify-state`.

## Effects

E-003 (REST scan contract) test dependents brought in line with F-081 — the api e2e now matches the
web e2e. No product/source change, so no new effect edges; record the test-side alignment on E-003.
