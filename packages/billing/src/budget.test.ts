import { describe, expect, it } from 'vitest';
import { createCompileBudgetClamp } from './budget.js';
import { createLocalBilling } from './adapters/local.js';
import { entitlementsFor } from './domain.js';
import type { BillingProvider, Subscription } from './ports.js';

/**
 * The shared entitlement clamp (F-077, ADR-0056). Both `/v1/compile` and the MCP compile tools
 * build their clamp here, so these cases pin the behaviour of BOTH surfaces at once.
 */

/** A clamp for a METERED deployment backed by `billing` — the only shape that caps (ADR-0060 §1). */
const metering = (billing: BillingProvider) => createCompileBudgetClamp({ billing, metered: true });

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

  it('does NOT cap an UNMETERED deployment that has a provider wired (ADR-0060 §1)', async () => {
    // The assertion that never existed, and the reason the defect survived a whole feature review.
    // The composition root ALWAYS wires a provider — createRuntimeBilling returns createLocalBilling()
    // for provider: 'none', and that adapter reports every tenant as free. So "is an object present"
    // was true for every Local and self-hosted deployment, and all of them were silently capped at
    // 8000 tokens per compile. Meterage is now stated, not inferred.
    const clamp = createCompileBudgetClamp({ billing: createLocalBilling(), metered: false });
    expect(await clamp('acme', 50_000)).toBe(50_000);
  });

  it('defaults to UNMETERED when the caller says nothing', async () => {
    // The default is load-bearing, not cosmetic: a caller that forgets to thread `metered` must get
    // the safe answer. Found by mutation — flipping the default to `true` turned NOTHING red, which
    // is the same shape of gap that let the object-presence predicate ship in the first place.
    const clamp = createCompileBudgetClamp({ billing: createLocalBilling() });
    expect(await clamp('acme', 50_000)).toBe(50_000);
  });

  it('caps a metered tenant to its plan', async () => {
    expect(await metering(providerOnPlan('free'))('acme', 50_000)).toBe(
      entitlementsFor('free').maxTokensPerCompile,
    );
    expect(await metering(providerOnPlan('pro'))('acme', 50_000)).toBe(
      entitlementsFor('pro').maxTokensPerCompile,
    );
    expect(await metering(providerOnPlan('enterprise'))('acme', 500_000)).toBe(
      entitlementsFor('enterprise').maxTokensPerCompile,
    );
  });

  it('never raises a budget below the cap', async () => {
    const clamp = metering(providerOnPlan('enterprise'));
    expect(await clamp('acme', 1_000)).toBe(1_000);
  });

  it('still caps a metered tenant that the LOCAL adapter backs (free subscription)', async () => {
    // The local adapter reports a free subscription. A deployment that declares itself METERED is
    // capped by whatever provider backs it — the unmetered case is the absence of `metered`, never
    // the identity of the adapter.
    const clamp = metering(createLocalBilling());
    expect(await clamp('acme', 50_000)).toBe(entitlementsFor('free').maxTokensPerCompile);
  });

  it('the cloud Free plan keeps its cap — the catalog is untouched by ADR-0056', () => {
    expect(entitlementsFor('free').maxTokensPerCompile).toBe(8000);
  });
});
