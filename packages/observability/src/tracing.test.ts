import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { currentTraceId, withSpan } from './tracing.js';

const exporter = new InMemorySpanExporter();
let provider: BasicTracerProvider;

beforeAll(() => {
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
  trace.setGlobalTracerProvider(provider);
});

afterAll(async () => {
  await provider.shutdown();
  trace.disable();
  context.disable();
});

beforeEach(() => exporter.reset());

describe('withSpan', () => {
  it('runs fn inside a span and returns its result', async () => {
    const result = await withSpan('op', () => 42);
    expect(result).toBe(42);
    expect(exporter.getFinishedSpans().map((span) => span.name)).toContain('op');
  });

  it('nests child spans under the parent (same trace) and exposes the trace id within', async () => {
    let innerTraceId: string | undefined;
    await withSpan('parent', async () => {
      await withSpan('child', () => {
        innerTraceId = currentTraceId();
      });
    });

    const spans = exporter.getFinishedSpans();
    const parent = spans.find((span) => span.name === 'parent');
    const child = spans.find((span) => span.name === 'child');
    expect(child?.spanContext().traceId).toBe(parent?.spanContext().traceId);
    expect(innerTraceId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('records an error status and rethrows', async () => {
    await expect(
      withSpan('boom', () => {
        throw new Error('nope');
      }),
    ).rejects.toThrow('nope');
    expect(exporter.getFinishedSpans().find((span) => span.name === 'boom')?.status.code).toBe(
      SpanStatusCode.ERROR,
    );
  });

  it('currentTraceId is undefined outside any span', () => {
    expect(currentTraceId()).toBeUndefined();
  });
});
