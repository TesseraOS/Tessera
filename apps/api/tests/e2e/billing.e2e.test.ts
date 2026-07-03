import { createHmac } from 'node:crypto';
import { createDodoBilling, createInMemorySubscriptionStore } from '@tessera/billing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer, type ApiServices } from '../../src/index';
import { createInMemoryServices } from './support/in-memory-services';

const WEBHOOK_SECRET = 'whsec_e2e';
const sign = (body: string): string =>
  createHmac('sha256', WEBHOOK_SECRET).update(body, 'utf8').digest('hex');

describe('@tessera/api billing (F-030)', () => {
  let services: ApiServices;

  beforeEach(async () => {
    services = await createInMemoryServices();
  });

  describe('local/free fallback (no billing provider wired)', () => {
    let app: ReturnType<typeof buildServer>;
    beforeEach(async () => {
      app = buildServer(services);
      await app.ready();
    });
    afterEach(async () => {
      await app.close();
    });

    it('lists plans publicly', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/billing/plans' });
      expect(res.statusCode).toBe(200);
      expect((res.json().plans as { id: string }[]).map((p) => p.id)).toEqual([
        'free',
        'pro',
        'enterprise',
      ]);
    });

    it('returns the free subscription for the default tenant (admin via local none)', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/billing/subscription' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ planId: 'free', status: 'active' });
    });

    it('rejects checkout in the local profile', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/billing/checkout',
        payload: { planId: 'pro', successUrl: 'https://app/ok', cancelUrl: 'https://app/no' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION');
    });

    it('clamps an over-plan compile budget to the free tier (F-035)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/compile',
        payload: { task: 'how does authentication work', budget: 50000 },
      });
      expect(res.statusCode).toBe(200);
      // Free plan caps maxTokensPerCompile at 8000.
      expect(res.json().budget).toBe(8000);
    });
  });

  describe('Dodo provider webhook (signature + subscription update)', () => {
    let app: ReturnType<typeof buildServer>;
    beforeEach(async () => {
      const billing = createDodoBilling({
        apiKey: 'sk',
        webhookSecret: WEBHOOK_SECRET,
        store: createInMemorySubscriptionStore(),
      });
      app = buildServer({ ...services, billing });
      await app.ready();
    });
    afterEach(async () => {
      await app.close();
    });

    it('applies a signed webhook, then reflects it in the subscription', async () => {
      const body = JSON.stringify({
        type: 'subscription.active',
        data: {
          subscription_id: 'sub_9',
          status: 'active',
          current_period_end: '2026-08-03T00:00:00.000Z',
          metadata: { tenant_id: 'default', plan_id: 'pro' },
        },
      });

      const hook = await app.inject({
        method: 'POST',
        url: '/v1/billing/webhook',
        headers: { 'content-type': 'application/json', 'webhook-signature': sign(body) },
        payload: body,
      });
      expect(hook.statusCode).toBe(200);
      expect(hook.json()).toEqual({ received: true, type: 'subscription.activated' });

      const sub = await app.inject({ method: 'GET', url: '/v1/billing/subscription' });
      expect(sub.json()).toMatchObject({ planId: 'pro', status: 'active', externalId: 'sub_9' });

      // With a pro subscription, the compile budget is capped at the higher pro limit (32000), not free.
      const compiled = await app.inject({
        method: 'POST',
        url: '/v1/compile',
        payload: { task: 'how does authentication work', budget: 50000 },
      });
      expect(compiled.statusCode).toBe(200);
      expect(compiled.json().budget).toBe(32000);
    });

    it('rejects a webhook with a bad signature (401)', async () => {
      const body = JSON.stringify({ type: 'subscription.active', data: { metadata: {} } });
      const res = await app.inject({
        method: 'POST',
        url: '/v1/billing/webhook',
        headers: { 'content-type': 'application/json', 'webhook-signature': 'bad' },
        payload: body,
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
