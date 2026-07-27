import {
  createInMemoryUsageStore,
  createLocalBilling,
  entitlementsFor,
  type UsageStore,
} from '@tessera/billing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildServer,
  createInMemoryTokenStore,
  createTokenAuthProvider,
  type ApiServices,
} from '../../src/index';
import { createInMemoryServices } from './support/in-memory-services';

/** `GET /v1/usage` (F-057; FR-47, NFR-12). */
describe('@tessera/api GET /v1/usage', () => {
  let services: ApiServices;
  let usage: UsageStore;
  let app: ReturnType<typeof buildServer>;

  const today = (): string => new Date().toISOString().slice(0, 10);
  const get = (url = '/v1/usage'): ReturnType<typeof app.inject> =>
    app.inject({ method: 'GET', url });

  beforeEach(async () => {
    services = { ...(await createInMemoryServices()), billing: createLocalBilling() };
    usage = createInMemoryUsageStore();
  });

  afterEach(async () => {
    await app?.close();
  });

  async function record(overrides: Record<string, unknown> = {}): Promise<void> {
    await usage.record({
      tenantId: 'default',
      projectId: 'default',
      operation: 'compile',
      occurredAt: new Date().toISOString(),
      durationMs: 100,
      tokens: 500,
      ...overrides,
    } as Parameters<UsageStore['record']>[0]);
  }

  describe('with a usage store wired', () => {
    beforeEach(async () => {
      app = buildServer(services, { usage, metered: true });
      await app.ready();
    });

    it('reports totals, latency and the daily series', async () => {
      await record({ durationMs: 100, tokens: 500 });
      await record({ durationMs: 300, tokens: 700 });
      await record({ operation: 'search', durationMs: 20, tokens: undefined });

      const body = (await get()).json();
      expect(body.totals).toMatchObject({ compiles: 2, searches: 1, tokensCompiled: 1200 });
      // Mean and max — never a percentile (ADR-0060 §3).
      expect(body.latency.compile).toEqual({ avgMs: 200, maxMs: 300 });
      expect(body.latency.search).toEqual({ avgMs: 20, maxMs: 20 });
      expect(body.daily).toEqual([
        { date: today(), compiles: 2, searches: 1, documentsIngested: 0, tokensCompiled: 1200 },
      ]);
    });

    it('clamps `from` to the earliest day the store actually holds', async () => {
      // ADR-0053 clause 3. Mutation check: returning the REQUESTED `from` turns this red — and the
      // chart would then draw a month of zeros for a store that has only ever seen one day.
      await record();

      const body = (await get('/v1/usage?days=365')).json();
      expect(body.from).toBe(today());
      expect(body.until).toBe(today());
    });

    it('reports null averages rather than zero for a window with no compiles', async () => {
      // A quality average of 0 is a claim about compiles that never happened.
      await record({ operation: 'search', tokens: undefined });

      const body = (await get()).json();
      expect(body.quality).toBeNull();
      expect(body.latency.compile).toBeNull();
      expect(body.totals.compiles).toBe(0);
    });

    it('averages the quality proxies over SCORED compiles only', async () => {
      await record({ budgetAdherence: 0.8, provenanceCoverage: 1 });
      await record({ budgetAdherence: 0.6, provenanceCoverage: 0.5 });
      await record(); // no scores — must not deflate the average

      const body = (await get()).json();
      expect(body.quality.avgBudgetAdherence).toBeCloseTo(0.7, 6);
      expect(body.quality.avgProvenanceCoverage).toBeCloseTo(0.75, 6);
    });

    it('scopes totals to the selected project but keeps the entitlement tenant-wide', async () => {
      // The asymmetry ADR-0060 §4 requires: analytics scopes like every other view, the subscription
      // does not. Mutation check: project-scoping the entitlement query turns this red.
      await record({ projectId: 'default' });
      await record({ projectId: 'other' });

      const body = (await get()).json();
      expect(body.totals.compiles).toBe(1);
      expect(body.entitlement).toMatchObject({
        maxMonthlyCompiles: entitlementsFor('free').maxMonthlyCompiles,
        compilesUsed: 2,
      });
    });

    it('rejects a window outside the documented bounds', async () => {
      expect((await get('/v1/usage?days=0')).statusCode).toBe(400);
      expect((await get('/v1/usage?days=400')).statusCode).toBe(400);
    });
  });

  it('reports a null entitlement on an unmetered deployment', async () => {
    // There is no entitlement to report, and reporting the free plan's would tell a self-hosted
    // operator they are on a tier they are not.
    app = buildServer(services, { usage });
    await app.ready();
    await record();

    expect((await get()).json().entitlement).toBeNull();
  });

  it('answers 409 when no usage store is wired', async () => {
    // The /v1/sources idiom. This is what keeps `buildServer({})` — the SDK's OpenAPI generator —
    // able to boot and produce a document.
    app = buildServer(services, { metered: true });
    await app.ready();

    const res = await get();
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('CONFLICT');
  });

  it('denies a non-admin — usage is tenant-wide billing evidence', async () => {
    // Guarded by the EXISTING `admin:manage`, not a new permission: a new one would ripple
    // GET /v1/rbac → OpenAPI → SDK → the dashboard's token-scope UI for no gain.
    const tokenStore = createInMemoryTokenStore();
    app = buildServer(services, {
      usage,
      metered: true,
      auth: createTokenAuthProvider({ tokenStore }),
    });
    await app.ready();
    const { token } = await tokenStore.issue({
      tenantId: 'acme',
      principalId: 'member-1',
      roles: ['member'] as never,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/v1/usage',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('is registered in the OpenAPI document even with empty services', async () => {
    app = buildServer({});
    await app.ready();

    const spec = (await app.inject({ method: 'GET', url: '/v1/openapi.json' })).json();
    expect(spec.paths['/v1/usage']).toBeDefined();
  });
});
