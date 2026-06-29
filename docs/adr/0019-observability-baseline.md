# ADR-0019: Observability baseline — OTel API in libraries, SDK at the process, additive instrumentation

- **Status:** Accepted
- **Date:** 2026-06-29
- **Deciders:** Project lead, Claude
- **Tags:** observability, tracing, logging, metrics

## Context

F-016 adds the observability baseline (NFR-7): traces, structured logs, and metrics across the
running system. The challenge is delivering genuine cross-layer observability **without
retrofitting instrumentation into the already-built, verified domain packages** (golden rule: never
break verified code; additive only) and without coupling libraries to a heavy SDK.

## Decision

**1. Libraries depend on the OpenTelemetry *API* only; the SDK is wired at the process.**
`@tessera/observability` exposes `withSpan`/`currentTraceId` and metric instruments over
`@opentelemetry/api` — **no-ops until** `startTelemetry` (NodeSDK) registers providers + an async
context manager at process start. Logging is **Pino** with built-in **redaction** of secret keys and
raw content (never logged). This keeps instrumentation cheap and dependency-light in libraries.

**2. Cross-layer spans come from an additive wrapper + HTTP auto-instrumentation, not edits to domain
code.** `instrumentServices(services, obs)` returns an `ApiServices` whose every call runs in a child
span + records latency (API → service) — the domain packages are untouched. `startTelemetry` enables
HTTP auto-instrumentation so each request gets a server span that the service spans nest under (via
OTel context). Per-adapter spans are a follow-up seam.

**3. Two small *additive* enhancements to verified features** (optional, non-breaking): the compiler
(F-010) times each stage into the existing trace (`TraceStage.durationMs?`), giving real
**compile-latency-per-stage** (recorded into a histogram by `instrumentServices`); and `buildServer`
(F-011) gains an optional `loggerInstance` so the redacting Pino logger backs per-request logging +
correlation ids. The REST/MCP response schemas simply ignore the new optional trace field.

**4. The process owns telemetry lifecycle; it is off by default.** `apps/server` builds observability
from `config.logLevel`, wires it through `startApiServer`/`startMcpServer`, and starts the OTel SDK
**only when `TESSERA_TELEMETRY=1`** (so traces/metrics don't spam the console by default; structured
logging is always on). The MCP bin logs to **stderr** (stdout is the protocol). Shutdown flushes the
SDK.

## Consequences

### Positive
- Genuine API → service spans with correlation ids, redacted structured logs, and the named latency
  metrics — with **zero changes to the domain packages** and only additive, optional changes to
  F-010/F-011.
- Instrumentation is cheap when telemetry is off (no-op API); the SDK and exporters are swappable
  (OTLP later) behind `startTelemetry`.

### Negative / Costs
- The observability package carries a real OTel dependency set (api + sdk-node + sdk-trace-base +
  sdk-metrics + context-async-hooks + instrumentation-http + resources + semantic-conventions) plus
  pino — heavy, but inherent to observability and isolated to one package.
- Full depth (per-adapter spans, a fed queue-depth gauge — the Queue port exposes no depth) is a
  documented seam, not yet delivered.

### Neutral / Follow-ups
- OTLP exporters via config; per-adapter spans; wiring `registerQueueDepthGauge` once the Queue port
  exposes pending count. Request-id propagation to downstream calls.

## Alternatives considered

- **Retrofit tracer/metrics params into every service/stage/adapter.** Maximally explicit but
  invasive — modifies verified code throughout and risks regressions. Rejected for the additive
  wrapper + auto-instrumentation.
- **A full bespoke logging/metrics stack (no OTel).** More control, but throws away the OTel ecosystem
  (exporters, conventions, auto-instrumentation). Rejected.
- **Telemetry on by default with console exporters.** Noisy and surprising for a baseline. Rejected
  in favour of `TESSERA_TELEMETRY=1`.

## References

- Implements F-016. Adds effect **E-015**; additive ripples on **E-013** (compiler trace) and
  **E-003** (`buildServer` option).
- Related: [ADR-0018](0018-config-loader-and-local-profile.md) (the runtime/bins this instruments),
  [ADR-0016](0016-rest-api-fastify-zod-bridge.md) (`buildServer`). `docs/PRD.md` NFR-7;
  `docs/architecture/ARCHITECTURE.md` §observability.
