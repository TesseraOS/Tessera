import { describe, expect, it } from 'vitest';
import { createCompileBudgetClamp } from './budget.js';
import { createLocalBilling } from './adapters/local.js';
import { entitlementsFor } from './domain.js';
import type { BillingProvider, Subscription } from './ports.js';

/**
 * The shared entitlement clamp (F-077, ADR-0056). Both `/v1/compile` and the MCP compile tools
 * build their clamp here, so these cases pin the behaviour of BOTH surfaces at once.
 */

/** A provider whose tenants sit on a chosen plan — enough for the clamp; the rest is unused. */
function providerOnPlan(planId: Subscription['planId']): BillingProvider {
  return {
    id: 'test',
    listPlans: () => [],
    getSubscription: (tenantId) =>
      Promise.resolve({
        tenantId,
        planId,
        status: 'active',
        currentPeriodEnd: null,
      } as Subscription),
    createCheckout: () => Promise.reject(new Error('unused')),
    handleWebhook: () => Promise.reject(new Error('unused')),
  };
}

describe('createCompileBudgetClamp', () => {
  it('does NOT cap when no provider is wired — self-hosted is unmetered (ADR-0056)', async () => {
    const clamp = createCompileBudgetClamp();
    // The decision in one assertion: an unwired deployment is self-hosted, not "on the free plan".
    expect(await clamp('acme', 500_000)).toBe(500_000);
    expect(await clamp('acme', 1_000)).toBe(1_000);
  });

  it('caps a metered tenant to its plan', async () => {
    expect(await createCompileBudgetClamp(providerOnPlan('free'))('acme', 50_000)).toBe(
      entitlementsFor('free').maxTokensPerCompile,
    );
    expect(await createCompileBudgetClamp(providerOnPlan('pro'))('acme', 50_000)).toBe(
      entitlementsFor('pro').maxTokensPerCompile,
    );
    expect(await createCompileBudgetClamp(providerOnPlan('enterprise'))('acme', 500_000)).toBe(
      entitlementsFor('enterprise').maxTokensPerCompile,
    );
  });

  it('never raises a budget below the cap', async () => {
    const clamp = createCompileBudgetClamp(providerOnPlan('enterprise'));
    expect(await clamp('acme', 1_000)).toBe(1_000);
  });

  it('still caps a metered tenant that the LOCAL adapter backs (free subscription)', async () => {
    // The local adapter reports a free subscription. Wiring it explicitly means "meter me", and it
    // must behave like any other provider — the unmetered case is the ABSENCE of a provider, not
    // the identity of this one.
    const clamp = createCompileBudgetClamp(createLocalBilling());
    expect(await clamp('acme', 50_000)).toBe(entitlementsFor('free').maxTokensPerCompile);
  });

  it('the cloud Free plan keeps its cap — the catalog is untouched by ADR-0056', () => {
    expect(entitlementsFor('free').maxTokensPerCompile).toBe(8000);
  });
});
