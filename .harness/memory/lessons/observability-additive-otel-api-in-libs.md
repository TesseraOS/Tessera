---
id: observability-additive-otel-api-in-libs
kind: lesson
title: Add observability without breaking verified code — OTel API in libs, SDK at the process, wrap don't retrofit
links:
  - packages/observability/src/instrument-services.ts
  - packages/observability/src/telemetry.ts
  - docs/adr/0019-observability-baseline.md
confidence: 0.9
created: 2026-06-29
---

**What happened:** F-016 added traces/logs/metrics across an engine whose domain packages were
already built and verified. Retrofitting tracer/metrics params into every service/stage/adapter would
have modified verified code throughout (golden rule: never break verified code). Three moves kept it
clean and additive:

1. **Libraries depend on the OTel *API* only; the SDK lives at the process.** `withSpan`/instruments
   use `@opentelemetry/api`, which is a **no-op until** `startTelemetry` (NodeSDK) registers providers
   + an async context manager at process start. So instrumentation is cheap and dependency-light
   everywhere; the heavy SDK is isolated to one process-side function.

2. **Wrap, don't retrofit.** `instrumentServices(services, obs)` returns an `ApiServices` whose every
   method runs in a child span + records latency — the domain packages are untouched. HTTP
   auto-instrumentation (in `startTelemetry`) gives request server spans that the service spans nest
   under via OTel context, so "API → service" nesting is real without editing route handlers.

3. **Only additive, optional changes to verified features.** The compiler gained an *optional*
   `TraceStage.durationMs` (so compile-latency-per-stage is real); `buildServer` gained an *optional*
   `loggerInstance`. The Zod response schemas simply strip the new optional field — no breakage.

**How to apply:**
- For any cross-cutting concern over verified code, prefer a **wrapper at the composition layer** +
  **optional** hooks over threading params through every layer.
- Keep telemetry **off by default** (`TESSERA_TELEMETRY=1` to enable) so a baseline doesn't spam the
  console; structured logging stays on. Redact secrets/content at the logger (NFR-7), and when stdout
  is a protocol channel (MCP), log to **stderr**.
- Fastify v5: a custom logger goes in `loggerInstance`, not `logger` (they are mutually exclusive).
- Be honest about depth: per-adapter spans and a fed queue-depth gauge are seams — provide the
  instrument, wire the data later. Related: [[composition-root-type-only-and-fake-provider]].
