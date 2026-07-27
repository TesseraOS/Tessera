import { createInMemoryUsageStore, type UsageStore } from '@tessera/billing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer, type ApiServices } from '../../src/index';
import { createInMemoryServices } from './support/in-memory-services';

/**
 * **F-057 increment 5** — the REST metering boundary (NFR-12, ADR-0060 §5).
 *
 * The properties under test are the ones a comment cannot guarantee: that a request is metered
 * **exactly once**, that a refused one is not metered at all, and that a broken store cannot take a
 * request down with it.
 */
const MAY = { from: '2026-01-01', until: '2036-12-31' } as const;

const countOf = async (usage: UsageStore, operation: string): Promise<number> => {
  const summary = await usage.summarize({ tenantId: 'default', ...MAY });
  return summary.find((aggregate) => aggregate.operation === operation)?.count ?? 0;
};

describe('@tessera/api usage metering (F-057)', () => {
  let services: ApiServices;
  let usage: UsageStore;
  let app: ReturnType<typeof buildServer>;

  beforeEach(async () => {
    services = await createInMemoryServices();
    usage = createInMemoryUsageStore();
    app = buildServer(services, { usage });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('records exactly one compile bucket per request, with the tokens the package actually held', async () => {
    // Mutation check: recording inside the compile handler AS WELL as in the onResponse hook turns
    // this red on `count`. The double-counting guard is a test, not a comment.
    const res = await app.inject({
      method: 'POST',
      url: '/v1/compile',
      payload: { task: 'explain the metering boundary', budget: 2000 },
    });
    expect(res.statusCode).toBe(200);

    const summary = await usage.summarize({ tenantId: 'default', ...MAY });
    const compile = summary.find((aggregate) => aggregate.operation === 'compile');
    expect(compile?.count).toBe(1);
    expect(compile?.tokens).toBe(res.json().totalTokens);
    // Fastify's own measurement; a hook that forgot to pass it would record 0 for every request.
    expect(compile?.sumDurationMs).toBeGreaterThan(0);
    // FR-47's retrieval-quality proxies ride the same bucket, and only compiles carry them.
    expect(compile?.scoredCount).toBe(1);
  });

  it('meters search and memory writes, and leaves reads alone', async () => {
    await app.inject({ method: 'POST', url: '/v1/search', payload: { query: 'anything' } });
    await app.inject({
      method: 'POST',
      url: '/v1/memory',
      payload: { kind: 'decision', title: 'Metered', body: 'A captured memory is metered.' },
    });
    // A read is not a metered operation — listing memories must not bill anybody.
    await app.inject({ method: 'GET', url: '/v1/memory' });

    expect(await countOf(usage, 'search')).toBe(1);
    expect(await countOf(usage, 'memory.write')).toBe(1);
    const summary = await usage.summarize({ tenantId: 'default', ...MAY });
    expect(summary.map((aggregate) => aggregate.operation).sort()).toEqual([
      'memory.write',
      'search',
    ]);
  });

  it('records nothing for a rejected request', async () => {
    // A 400 consumed no budget. Mutation check: removing the `statusCode >= 400` skip turns this red.
    const res = await app.inject({
      method: 'POST',
      url: '/v1/compile',
      payload: { task: '', budget: -1 },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(await countOf(usage, 'compile')).toBe(0);
  });

  it('serves the request even when the usage store is broken', async () => {
    // Failure isolation (ADR-0060 §5). A metering outage that becomes a request outage is strictly
    // worse than a few uncounted compiles.
    //
    // Honest note on what this does and does NOT prove — measured, not assumed: dropping the
    // `.catch(...)` in the hook leaves this test GREEN. The isolation on the REST path comes from
    // Fastify itself, because `onResponse` runs after the response is sent and a rejected hook is
    // logged rather than surfaced. The explicit `.catch` still earns its place — it turns an opaque
    // framework-level hook error into a warn carrying the operation, exactly as `recordAudit` does —
    // but this assertion pins the BEHAVIOUR (a broken store cannot fail a request), not that one line.
    const broken: UsageStore = {
      record: () => Promise.reject(new Error('usage store is down')),
      summarize: () => Promise.resolve([]),
      daily: () => Promise.resolve([]),
      earliestDay: () => Promise.resolve(null),
    };
    const brokenApp = buildServer(services, { usage: broken });
    await brokenApp.ready();
    try {
      const res = await brokenApp.inject({
        method: 'POST',
        url: '/v1/compile',
        payload: { task: 'still works', budget: 1000 },
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await brokenApp.close();
    }
  });

  it('meters nothing at all when no store is wired', async () => {
    // `buildServer({})` — what the SDK's OpenAPI generator boots — must not require a usage store.
    const unmetered = buildServer(services);
    await unmetered.ready();
    try {
      const res = await unmetered.inject({
        method: 'POST',
        url: '/v1/compile',
        payload: { task: 'unmetered', budget: 1000 },
      });
      expect(res.statusCode).toBe(200);
      expect(await countOf(usage, 'compile')).toBe(0);
    } finally {
      await unmetered.close();
    }
  });
});
