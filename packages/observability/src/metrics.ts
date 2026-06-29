import { metrics, type Histogram, type Meter } from '@opentelemetry/api';

/** The meter name all Tessera instruments are created under. */
export const METER_NAME = '@tessera/observability';

/** The Tessera meter (no-op until a meter provider is registered, e.g. by `startTelemetry`). */
export function getMeter(): Meter {
  return metrics.getMeter(METER_NAME);
}

/** Core metric instruments (NFR-7): request/service/compile-stage latency. All durations in ms. */
export interface Instruments {
  /** HTTP request handling time. */
  readonly httpServerDuration: Histogram;
  /** Domain service call time (API → service). */
  readonly serviceCallDuration: Histogram;
  /** Context-compiler time per stage (attribute `stage`). */
  readonly compileStageDuration: Histogram;
}

/** Create the core {@link Instruments} on a meter (defaults to the global Tessera meter). */
export function createInstruments(meter: Meter = getMeter()): Instruments {
  return {
    httpServerDuration: meter.createHistogram('tessera.http.server.duration', {
      unit: 'ms',
      description: 'HTTP request handling time',
    }),
    serviceCallDuration: meter.createHistogram('tessera.service.call.duration', {
      unit: 'ms',
      description: 'Domain service call time',
    }),
    compileStageDuration: meter.createHistogram('tessera.compile.stage.duration', {
      unit: 'ms',
      description: 'Context-compiler time per stage',
    }),
  };
}

/** A compilation trace's per-stage timings (a structural slice of `@tessera/context-compiler`). */
export interface TimedTrace {
  readonly stages: readonly { readonly stage: string; readonly durationMs?: number }[];
}

/** Record each timed compiler stage into the compile-stage histogram (compile latency per stage). */
export function recordCompileStageDurations(instruments: Instruments, trace: TimedTrace): void {
  for (const stage of trace.stages) {
    if (typeof stage.durationMs === 'number') {
      instruments.compileStageDuration.record(stage.durationMs, { stage: stage.stage });
    }
  }
}

/**
 * Register an observable gauge reporting queue depth on each collection; `read` supplies the current
 * value. Wire it where a depth source exists (the in-process Queue can expose its pending count).
 */
export function registerQueueDepthGauge(read: () => number, meter: Meter = getMeter()): void {
  const gauge = meter.createObservableGauge('tessera.queue.depth', {
    description: 'Pending jobs in the queue',
  });
  gauge.addCallback((result) => result.observe(read()));
}
