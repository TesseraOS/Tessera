import {
  createInMemoryUsageStore,
  createLocalBilling,
  entitlementsFor,
  type UsageStore,
} from '@tessera/billing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer, type ApiServices } from '../../src/index';
import { createInMemoryServices } from './support/in-memory-services';

/**
 * **F-057 increment 6b — the F-035 closure.** `maxMonthlyCompiles` has existed in the plan catalog
 * since F-030 and has never been read by anything: a tenant on the Free plan could compile without
 * limit, forever. This suite is what that seam looks like from the outside.
 *
 * The rule is enforced by ONE implementation (`createMonthlyCompileGuard`) that both `/v1/compile`
 * and the MCP compile tools call, so it cannot hold on the surface humans use and lapse on the one
 * agents use — which is exactly the defect F-077 existed to fix for the token clamp.
 */
const FREE_LIMIT = entitlementsFor('free').maxMonthlyCompiles;

/** Seed `count` compiles into the CURRENT calendar month, as the metering hook would have. */
async function seedCompiles(usage: UsageStore, count: number): Promise<void> {
  const occurredAt = new Date().toISOString();
  for (let index = 0; index < count; index += 1) {
    await usage.record({
      tenantId: 'default',
      projectId: 'default',
      operation: 'compile',
      occurredAt,
      durationMs: 5,
      tokens: 100,
    });
  }
}

describe('@tessera/api monthly compile entitlement (F-035, F-057)', () => {
  let services: ApiServices;
  let usage: UsageStore;
  let app: ReturnType<typeof buildServer>;

  const compile = (): ReturnType<typeof app.inject> =>
    app.inject({
      method: 'POST',
      url: '/v1/compile',
      payload: { task: 'how does authentication work', budget: 2000 },
    });

  beforeEach(async () => {
    services = { ...(await createInMemoryServices()), billing: createLocalBilling() };
    usage = createInMemoryUsageStore();
  });

  afterEach(async () => {
    await app?.close();
  });

  describe('a metered deployment', () => {
    beforeEach(async () => {
      app = buildServer(services, { usage, metered: true });
      await app.ready();
    });

    it('allows a compile below the monthly entitlement', async () => {
      await seedCompiles(usage, FREE_LIMIT - 1);
      expect((await compile()).statusCode).toBe(200);
    });

    it('refuses with 429 once the entitlement is spent', async () => {
      // Mutation check: `>` instead of `>=` in the guard turns this red — the off-by-one that would
      // hand out one free compile a month per tenant, forever.
      await seedCompiles(usage, FREE_LIMIT);

      const res = await compile();
      expect(res.statusCode).toBe(429);
      const body = res.json();
      expect(body.error.code).toBe('RATE_LIMITED');
      // The caller is told what it hit and when it clears — a refusal it cannot act on is a dead end.
      expect(body.error.details).toMatchObject({ limit: FREE_LIMIT, used: FREE_LIMIT });
      expect(typeof body.error.details.resetAt).toBe('string');
    });

    it('does not count a refused compile against the tenant', async () => {
      // The metering hook skips `>= 400`, so a refusal must not inflate the number that caused it.
      // Without this the counter would run away from the limit every time a client retried.
      await seedCompiles(usage, FREE_LIMIT);
      await compile();

      const summary = await usage.summarize({
        tenantId: 'default',
        from: '2026-01-01',
        until: '2036-12-31',
        operations: ['compile'],
      });
      expect(summary[0]?.count).toBe(FREE_LIMIT);
    });

    it('counts across projects — a subscription is per tenant', async () => {
      // Mutation check: scoping the guard's query to a project turns this red. Per-project counting
      // would let a tenant mint unlimited compiles by minting projects.
      const occurredAt = new Date().toISOString();
      for (let index = 0; index < FREE_LIMIT; index += 1) {
        await usage.record({
          tenantId: 'default',
          projectId: `project-${index % 7}`,
          operation: 'compile',
          occurredAt,
          durationMs: 5,
        });
      }
      expect((await compile()).statusCode).toBe(429);
    });

    it('ignores usage from a previous month', async () => {
      // The entitlement is per CALENDAR month (UTC). A tenant that exhausted January must compile
      // in February. Mutation check: dropping the window from the guard's query turns this red.
      const lastMonth = new Date();
      lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1, 15);
      for (let index = 0; index < FREE_LIMIT; index += 1) {
        await usage.record({
          tenantId: 'default',
          projectId: 'default',
          operation: 'compile',
          occurredAt: lastMonth.toISOString(),
          durationMs: 5,
        });
      }
      expect((await compile()).statusCode).toBe(200);
    });

    it('never refuses an unlimited plan', async () => {
      // `-1` is unlimited (enterprise). A guard that compared numerically without the sentinel check
      // would refuse enterprise tenants at zero compiles — the worst possible customer to break.
      const enterprise: ApiServices = {
        ...services,
        billing: {
          ...createLocalBilling(),
          getSubscription: (tenantId) =>
            Promise.resolve({
              tenantId,
              planId: 'enterprise' as const,
              status: 'active' as const,
              currentPeriodEnd: null,
            }),
        },
      };
      await app.close();
      app = buildServer(enterprise, { usage, metered: true });
      await app.ready();

      await seedCompiles(usage, FREE_LIMIT * 2);
      expect((await compile()).statusCode).toBe(200);
    });

    it('fails OPEN when the usage store is unreachable', async () => {
      // ADR-0060 §6, and a deliberate cost leak: a metering outage that becomes a product outage is
      // worse than a few uncounted compiles. Asserted, never assumed.
      const broken: UsageStore = {
        record: () => Promise.reject(new Error('usage store is down')),
        summarize: () => Promise.reject(new Error('usage store is down')),
        daily: () => Promise.reject(new Error('usage store is down')),
        earliestDay: () => Promise.reject(new Error('usage store is down')),
      };
      await app.close();
      app = buildServer(services, { usage: broken, metered: true });
      await app.ready();

      expect((await compile()).statusCode).toBe(200);
    });
  });

  describe('an unmetered deployment', () => {
    it('never refuses, however much it has compiled', async () => {
      // The ADR-0060 §1 predicate applies to BOTH entitlement rules, or a self-hosted operator is
      // blocked after 200 compiles a month on their own hardware.
      app = buildServer(services, { usage });
      await app.ready();

      await seedCompiles(usage, FREE_LIMIT * 3);
      expect((await compile()).statusCode).toBe(200);
    });
  });
});
