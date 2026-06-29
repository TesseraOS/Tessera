import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { describe, expect, it } from 'vitest';
import { startTelemetry } from './telemetry.js';

describe('startTelemetry', () => {
  it('starts the SDK and shuts down cleanly', async () => {
    const telemetry = startTelemetry({
      httpInstrumentation: false,
      spanProcessors: [new SimpleSpanProcessor(new InMemorySpanExporter())],
    });
    await expect(telemetry.shutdown()).resolves.toBeUndefined();
  });
});
