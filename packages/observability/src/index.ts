/**
 * @tessera/observability — the observability baseline (NFR-7): structured logging, tracing, and
 * metrics.
 *
 * A **Pino** logger with secret/content **redaction**; **OpenTelemetry** tracing (`withSpan`,
 * `currentTraceId`) and metric instruments over the OTel API (no-op until `startTelemetry` registers
 * the SDK); and `instrumentServices`, an additive wrapper that gives every domain-service call a
 * span + latency metric (API → service) without touching the domain packages. The compiler's
 * per-stage timings feed a compile-latency-per-stage histogram.
 */
export * from './logger.js';
export * from './tracing.js';
export * from './metrics.js';
export * from './telemetry.js';
export * from './observability.js';
export * from './instrument-services.js';
