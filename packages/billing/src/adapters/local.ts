import { ValidationError } from '@tessera/core';
import { freeSubscription, listPlans } from '../domain.js';
import type { BillingProvider } from '../ports.js';

/**
 * The **local/free** billing adapter — the OSS default (open-core). Every tenant is on the free plan;
 * there is no external payments service, no checkout, and no webhooks. Managed Cloud swaps in the Dodo
 * adapter behind the same {@link BillingProvider} port (ADR-0011/0031).
 */
export function createLocalBilling(): BillingProvider {
  return {
    id: 'local',
    listPlans,
    getSubscription: (tenantId) => Promise.resolve(freeSubscription(tenantId)),
    createCheckout: () =>
      Promise.reject(
        new ValidationError('billing checkout is not available in the local profile (open-core)'),
      ),
    handleWebhook: () =>
      Promise.reject(
        new ValidationError('billing webhooks are not available in the local profile'),
      ),
  };
}
