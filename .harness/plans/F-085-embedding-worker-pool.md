# Plan: F-085 Embedding holds the event loop — move it to a bounded worker-thread pool

- **Feature:** F-085 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** NFR-2, FR-6
- **Service / package:** `@tessera/ai` → `@tessera/config`
- **Author:** Claude (Opus 4.8) · **Date:** 2026-07-17

## Intent

User item 13: *"For API service, use multi-threading and multi-processing. We want to handle parallel
requests as much as possible."*

Done means: a scan no longer costs every concurrent request a ~36ms stall per embedded chunk, and the
improvement is **measured**, not asserted.

## The measurement (this is the feature's foundation — do not re-litigate it, re-run it)

`@huggingface/transformers` runs ONNX through `onnxruntime-node`, whose async `run()` is *widely
assumed* to offload to libuv's threadpool. If it did, this feature would be theatre. It does not.

Calibrated against **both** hypotheses, in the real shape of the work (24 × 36ms with await
boundaries — one embed per call). Mean event-loop delay:

| | mean loop delay |
|---|---|
| CONTROL B — offloaded (`await` a timer) | **16.7ms** |
| **EMBEDDING — 24 real chunks** | **32.9ms** |
| CONTROL A — on-thread (sync burst) | **36.1ms** |

Embedding reads as **on-thread**. Three earlier attempts got this wrong and the controls caught each
one (max-lag cannot separate the hypotheses; cumulative-lag and `monitorEventLoopDelay` both read a
*known* busy-loop as 0% blocked, because while the thread is held no sample is ever taken). **Any
re-measurement must keep both controls** — an instrument that cannot see a deliberate block cannot be
trusted about an undeliberate one.

Also measured, and it constrains the design: **model load is a ~3s on-thread block and ~90MB
resident**, and a worker cannot share it — N workers = N loads.

## Approach

1. **`createWorkerPoolEmbeddings`** in `@tessera/ai`, implementing the **same `Embeddings` port**
   (`embed`/`embedBatch`/`info`) — swappable per ADR-0006, no caller changes.
2. **Bounded, and defaulted honestly.** `embeddings.workers`, default **1**, `0` = in-process.
   - **Do not default to `cpus-1` by reflex.** Each worker is a full model copy (~3s, ~90MB).
   - **1 is the whole fix**: it moves 100% of embedding off the request-serving thread, which is what
     the report is about. It also costs nothing in scan throughput — `embedBatch` in the current
     adapter is a sequential `for` loop, so embedding is *already* serial. >1 makes scans faster; it
     does not make the API more available.
3. **Degrade, never fail.** `worker_threads` + a native module can fail to start (odd runtimes,
   restricted hosts). On spawn/init failure, fall back to the in-process adapter and log — a scan
   that works slowly beats a workspace that cannot index.
4. **Prove it.** Re-run the calibrated harness; embedding's mean loop delay must fall toward the
   16.7ms offloaded control. A claim of "now non-blocking" without a re-measurement is exactly what
   this feature exists to disprove.

## Files to touch

- `packages/ai/src/adapters/worker-pool/{index.ts,worker.mjs}` + `index.test.ts`; `packages/ai/src/index.ts`.
- `packages/ai/package.json` — the worker must reach `dist` (see Risks).
- `packages/config/src/schema.ts` (`embeddings.workers`), `profiles/local.ts` (`createEmbeddings`),
  and the env/config docs the state verifier checks.

## Anticipated effects

- **E-014 (config schema + Local profile composition)** — a new config field and a new branch in
  `createEmbeddings`. The profile is the composition root, so this is where it lands.
- **No port change**: the pool implements `Embeddings` as-is, so `@tessera/retrieval`,
  the indexing sink and the compiler are untouched by construction. That is the point of ADR-0006.
- **Lifecycle is new.** Nothing in the runtime owns "close the embeddings" today, because nothing
  needed it. A leaked worker keeps the process alive — check whether `createLocalRuntime` has a
  shutdown seam and use it; if it does not, that gap is this feature's, not a follow-up.

## Test plan

- **Unit:** the pool satisfies the port (same vectors as in-process for the same input — same model,
  so they must match); `embedBatch` preserves input order under concurrency (the queue must not
  reorder); a worker that fails to init degrades to in-process rather than throwing; `close()` leaves
  no live worker.
- **Measured:** the calibrated harness, both controls retained, before/after.
- **Regression:** `@tessera/ai` + `@tessera/config` suites stay green; the Local runtime still boots.

## Verification

Gates: `state`, `typecheck`, `lint`, `format`, `test`, `build`. Plus the loop-delay measurement
recorded in `progress.md` — the acceptance names it explicitly.

## Risks / open questions

- **The worker entry path is the real trap, and it is why `worker.mjs` is plain JS, not TS.**
  `tsc` would compile `worker.ts` → `dist/…/worker.js`, and `new URL('./worker.js', import.meta.url)`
  resolves relative to the *compiled* file — but **vitest runs from `src`**, where no `worker.js`
  exists, so unit tests would spawn a path that is not there while the built package works. Keeping
  the worker as `worker.mjs` in `src` makes the path resolve identically in both, at the cost of a
  **copy step into `dist`** (`tsc` does not copy non-TS files). Decide this before writing the pool;
  getting it wrong shows up only in tests, or only in production.
- **Default-on is a behaviour change** for every deployment (`provider` already defaults to
  `transformers`, so the blocking is the *default* path today — that is the argument for fixing the
  default rather than hiding the fix behind a flag). The fallback in (3) is what makes it safe.
- **Scope, restated:** this makes the *work* leave the main thread. It does **not** make the API
  multi-**process** — the event bus and scan-status map are in-process (F-079 was that bug at the app
  layer), and clustering needs F-056's shared bus. Nothing here may be described as multi-process.
- Serialising vectors over `postMessage` copies them; a 384-float array per chunk is small, but batch
  sizes are the thing to watch if it ever looks slow.
