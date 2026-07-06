import { context, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import type { ApiServices } from '@tessera/api';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { instrumentServices } from './instrument-services.js';
import { silentObservability } from './observability.js';

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

/** A minimal stand-in for the domain services — only the methods the test calls matter. */
const fakeServices = {
  search: { search: () => Promise.resolve([{ ref: 'doc', score: 1, signals: [] }]) },
  graph: { getEffects: () => Promise.resolve([]) },
  memory: { capture: () => Promise.resolve({ id: 'm1' }) },
  compiler: {
    compile: (request: { task: string; budget: number }) =>
      Promise.resolve({
        task: request.task,
        budget: request.budget,
        sections: [],
        totalTokens: 0,
        trace: { stages: [{ stage: 'plan', durationMs: 1 }] },
        scores: { fragmentCount: 0, budgetAdherence: 1, provenanceCoverage: 1, redundancy: 0 },
      }),
  },
} as unknown as ApiServices;

describe('instrumentServices', () => {
  it('passes results through and records a span per call (API → service)', async () => {
    const instrumented = instrumentServices(fakeServices, silentObservability);

    const results = await instrumented.search.search({ text: 'q' });
    expect(results).toHaveLength(1);

    const pkg = await instrumented.compiler.compile({ task: 't', budget: 10 });
    expect(pkg.totalTokens).toBe(0);

    const names = exporter.getFinishedSpans().map((span) => span.name);
    expect(names).toContain('search.search');
    expect(names).toContain('compile');
  });

  it('forwards the optional sources + billing members (regression: they must not be dropped)', async () => {
    const withOptional = {
      ...fakeServices,
      sources: { list: () => Promise.resolve([]) },
      billing: { listPlans: () => [{ id: 'free' }] },
    } as unknown as ApiServices;

    const instrumented = instrumentServices(withOptional, silentObservability);

    // Both are present (dropping them silently 500s /v1/sources and the tenant's billing routes).
    expect(instrumented.sources).toBeDefined();
    expect(instrumented.billing).toBeDefined();

    // billing is passed through untraced → its synchronous methods still return values (not Promises).
    expect(instrumented.billing?.listPlans()).toEqual([{ id: 'free' }]);

    // sources is traced like the other services.
    await instrumented.sources?.list();
    expect(exporter.getFinishedSpans().map((span) => span.name)).toContain('sources.list');
  });
});
