# Plan: F-016 Observability baseline — OpenTelemetry traces + Pino logs + metrics

- **Feature:** F-016 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** NFR-7 — `docs/PRD.md`
- **Service / package:** `@tessera/observability` (`packages/observability`)
- **Author:** Claude (Opus 4.8) · **Date:** 2026-06-29

## Intent
A production-grade observability **toolkit** wired into the running process, **without retrofitting
instrumentation into every verified package**. Structured logging that never leaks secrets/content,
OTel spans across API → service (with correlation ids), and core latency metrics including
compile-latency-per-stage.

## Approach
- **`@tessera/observability`** (the deliverable): libraries depend only on the **OTel API**; the SDK
  is wired at the process.
  - `createLogger` — Pino with **redaction** of secret keys + raw content (`silentLogger`, `stderr`
    option for MCP).
  - `withSpan`/`currentTraceId` — OTel-API tracing; spans nest via active context (no-op until an SDK
    registers a provider).
  - `createInstruments`/`recordCompileStageDurations`/`registerQueueDepthGauge` — OTel-API metrics:
    http/service/compile-stage histograms (+ queue-depth gauge seam).
  - `startTelemetry` — NodeSDK bootstrap (providers + async context manager + HTTP auto-instrumentation
    so requests get server spans that service spans nest under); console exporters by default, OTLP a
    config follow-up.
  - `instrumentServices(services, obs)` — **additive** `ApiServices` wrapper: each call → child span +
    latency metric (API → service), the compiler also records per-stage metrics. Domain packages
    untouched.
- **Additive enhancements (no breakage):** the compiler (F-010) times each stage into the existing
  trace (`TraceStage.durationMs?`); `buildServer` (F-011) gains an optional `loggerInstance` so the
  redacting Pino logger backs per-request logging + correlation (`reqId`).
- **Wire into `apps/server`** (F-032): `startApiServer`/`startMcpServer` accept `observability` →
  instrument services, use the logger; the REST server records HTTP latency in an `onResponse` hook.
  Bins build observability from `config.logLevel` and start telemetry when `TESSERA_TELEMETRY=1`
  (off by default → no console spam; logging always on).

## Files to touch
- `packages/observability/**` (logger, tracing, metrics, telemetry, instrument-services, observability,
  index + tests + README).
- `packages/context-compiler/src/{domain,compiler}.ts` (+ test) — additive stage timing.
- `apps/api/src/server.ts` — additive `loggerInstance`.
- `apps/server/**` — wire observability + the http-latency hook + telemetry in the bins.
- State + ADR-0019 + effect (new) + progress.

## Anticipated effects
- **New effect** (observability toolkit + `instrumentServices` + telemetry ⇒ the server bins consume
  it; compiler `durationMs` feeds the compile-stage metric). Additive ripples on **E-013** (compiler
  trace gains an optional field — surfaces strip it) and **E-003** (`buildServer` gains an optional
  option). No breaking change.

## Test plan
- **Unit:** logger redaction (secrets/content/nested); `withSpan` (creates/nests spans via in-memory
  exporter, error status, `currentTraceId`); metrics (compile-stage histogram via in-memory reader);
  `instrumentServices` (passthrough + span per call); `startTelemetry` start/shutdown; compiler stage
  `durationMs` present.
- **Integration:** `startApiServer` with `observability` boots and serves `/v1/search` (instrumented
  path).

## Verification
`state · typecheck · lint · format:check · test · build` (+ unchanged `test:e2e`). Full workspace, green.

## Risks / open questions
- **Don't break verified code:** all changes additive (optional fields/options, a wrapper); domain
  packages untouched.
- **Libraries depend on the OTel API only**; the heavy SDK is process-side (`startTelemetry`).
- **Documented seams:** per-adapter spans + a queue-depth feed (the Queue port has no depth) are
  follow-ups; the instruments/gauge exist. OTLP exporters are a config follow-up.
- No open `OQ*`.
