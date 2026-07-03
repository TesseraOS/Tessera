import { describe, expect, it } from 'vitest';
import { TesseraError } from '@tessera/core';
import { createLocalBilling } from './local.js';

describe('local billing adapter (open-core default)', () => {
  const billing = createLocalBilling();

  it('puts every tenant on the active free plan', async () => {
    const sub = await billing.getSubscription('acme');
    expect(sub).toMatchObject({ planId: 'free', status: 'active' });
    expect(billing.listPlans().map((p) => p.id)).toContain('pro');
  });

  it('rejects checkout and webhooks (no external provider locally)', async () => {
    await expect(
      billing.createCheckout({
        tenantId: 'acme',
        planId: 'pro',
        successUrl: 'https://app/ok',
        cancelUrl: 'https://app/no',
      }),
    ).rejects.toBeInstanceOf(TesseraError);
    await expect(billing.handleWebhook({ rawBody: '{}', signature: 'x' })).rejects.toBeInstanceOf(
      TesseraError,
    );
  });
});
