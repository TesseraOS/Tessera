import { metrics } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createInstruments, recordCompileStageDurations } from './metrics.js';

const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 100_000 });
let provider: MeterProvider;

beforeAll(() => {
  provider = new MeterProvider({ readers: [reader] });
  metrics.setGlobalMeterProvider(provider);
});

afterAll(async () => {
  await provider.shutdown();
  metrics.disable();
});

describe('metrics instruments', () => {
  it('records only the timed compiler stages into the compile-stage histogram', async () => {
    const instruments = createInstruments();
    recordCompileStageDurations(instruments, {
      stages: [
        { stage: 'plan', durationMs: 1.5 },
        { stage: 'rank', durationMs: 2 },
        { stage: 'untimed' },
      ],
    });

    await provider.forceFlush();

    const all = exporter
      .getMetrics()
      .flatMap((resource) => resource.scopeMetrics.flatMap((scope) => scope.metrics));
    const histogram = all.find(
      (metric) => metric.descriptor.name === 'tessera.compile.stage.duration',
    );
    expect(histogram).toBeDefined();
    // One data point per distinct `{ stage }` attribute set; the untimed stage is skipped.
    expect(histogram?.dataPoints.length).toBe(2);
  });
});
