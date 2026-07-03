import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { TesseraError } from '@tessera/core';
import { createInMemorySubscriptionStore } from '../subscription-store.js';
import { createDodoBilling, parseDodoEvent, verifyDodoSignature } from './dodo.js';

const SECRET = 'whsec_test';
const sign = (body: string): string =>
  createHmac('sha256', SECRET).update(body, 'utf8').digest('hex');

function activePayload(tenant: string): string {
  return JSON.stringify({
    type: 'subscription.active',
    data: {
      subscription_id: 'sub_123',
      status: 'active',
      current_period_end: '2026-08-03T00:00:00.000Z',
      metadata: { tenant_id: tenant, plan_id: 'pro' },
    },
  });
}

describe('verifyDodoSignature', () => {
  it('accepts a correct HMAC and rejects wrong/missing ones', () => {
    const body = activePayload('acme');
    expect(verifyDodoSignature(body, sign(body), SECRET)).toBe(true);
    expect(verifyDodoSignature(body, 'deadbeef', SECRET)).toBe(false);
    expect(verifyDodoSignature(body, undefined, SECRET)).toBe(false);
    expect(verifyDodoSignature(body, sign(body), 'other-secret')).toBe(false);
  });
});

describe('parseDodoEvent', () => {
  it('maps an activation to a pro subscription', () => {
    const event = parseDodoEvent(activePayload('acme'));
    expect(event.type).toBe('subscription.activated');
    expect(event.subscription).toMatchObject({
      tenantId: 'acme',
      planId: 'pro',
      status: 'active',
      externalId: 'sub_123',
    });
  });

  it('maps a cancellation to canceled', () => {
    const body = JSON.stringify({
      type: 'subscription.cancelled',
      data: { status: 'cancelled', metadata: { tenant_id: 'acme', plan_id: 'pro' } },
    });
    expect(parseDodoEvent(body).subscription.status).toBe('canceled');
  });

  it('rejects unknown types and a missing tenant', () => {
    expect(() => parseDodoEvent('{"type":"nope","data":{}}')).toThrow(TesseraError);
    expect(() =>
      parseDodoEvent(JSON.stringify({ type: 'subscription.active', data: { metadata: {} } })),
    ).toThrow(TesseraError);
  });
});

describe('createDodoBilling', () => {
  it('applies a signed webhook to the subscription store', async () => {
    const store = createInMemorySubscriptionStore();
    const billing = createDodoBilling({ apiKey: 'sk', webhookSecret: SECRET, store });
    const body = activePayload('acme');

    const event = await billing.handleWebhook({ rawBody: body, signature: sign(body) });
    expect(event.subscription.planId).toBe('pro');
    // Now getSubscription reflects the stored state.
    expect((await billing.getSubscription('acme')).planId).toBe('pro');
    // A tenant with no events falls back to free.
    expect((await billing.getSubscription('other')).planId).toBe('free');
  });

  it('rejects an unsigned/invalid webhook with UNAUTHORIZED', async () => {
    const billing = createDodoBilling({
      apiKey: 'sk',
      webhookSecret: SECRET,
      store: createInMemorySubscriptionStore(),
    });
    await expect(
      billing.handleWebhook({ rawBody: activePayload('acme'), signature: 'bad' }),
    ).rejects.toSatisfy((e: unknown) => e instanceof TesseraError && e.code === 'UNAUTHORIZED');
  });

  it('creates a checkout via the injected fetch and returns the hosted url', async () => {
    const fakeFetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ url: 'https://pay.dodo/x', id: 'chk_1' }), { status: 200 }),
      )) as typeof fetch;
    const billing = createDodoBilling({
      apiKey: 'sk',
      webhookSecret: SECRET,
      store: createInMemorySubscriptionStore(),
      fetch: fakeFetch,
    });
    const session = await billing.createCheckout({
      tenantId: 'acme',
      planId: 'pro',
      successUrl: 'https://app/ok',
      cancelUrl: 'https://app/no',
    });
    expect(session.url).toBe('https://pay.dodo/x');
    expect(session.externalId).toBe('chk_1');
  });
});
