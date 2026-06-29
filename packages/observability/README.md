# @tessera/observability

The observability baseline (F-016; NFR-7): structured logging, tracing, and metrics. Libraries depend
only on the **OpenTelemetry API**; the SDK is wired once at the process by `startTelemetry`.

## What it provides

- **Logging** — `createLogger(config)`: a Pino logger with built-in **redaction** of secret keys
  (`password`/`token`/`authorization`/…) and raw ingested content (`content`/`rawContent`); never logs
  secrets (NFR-7). `silentLogger` for tests; `stderr: true` when stdout is a protocol channel (MCP).
- **Tracing** — `withSpan(name, fn)` runs `fn` in an active span (children nest via OTel context);
  `currentTraceId()` is the correlation id. No-ops until a provider is registered.
- **Metrics** — `createInstruments()` (http / service-call / compile-stage latency histograms),
  `recordCompileStageDurations(trace)`, and `registerQueueDepthGauge(read)`.
- **SDK bootstrap** — `startTelemetry(options)` registers the providers + async context manager +
  HTTP auto-instrumentation (so requests get server spans that service spans nest under). Console
  exporters by default; OTLP is a config follow-up. Returns `{ shutdown }`.
- **Service instrumentation** — `instrumentServices(services, obs)`: an **additive** `ApiServices`
  wrapper that gives every domain call a child span + latency metric (API → service) and records
  per-stage compile latency — **without modifying the domain packages**.

## Wiring (in `@tessera/server`)

The bins build observability from `config.logLevel`, pass the Pino logger to the REST server
(`loggerInstance`, giving per-request logs + correlation ids) and the MCP server (stderr), wrap the
services with `instrumentServices`, and record HTTP latency. Telemetry (traces/metrics export) is
started only when `TESSERA_TELEMETRY=1` — structured logging is always on.

## Seams (follow-ups)

Per-adapter spans; feeding `registerQueueDepthGauge` (the Queue port exposes no depth yet); OTLP
exporters via config. The instruments/gauge exist now; these wire real data later.
