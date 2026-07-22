import { clampBudgetToPlan, effectiveEntitlements } from './domain.js';
import type { BillingProvider } from './ports.js';

/**
 * Resolve a requested compile budget to the effective one for a tenant (NFR-12; F-035, F-077).
 *
 * Returned by {@link createCompileBudgetClamp} and called per compile.
 */
export type CompileBudgetClamp = (tenantId: string, requestedBudget: number) => Promise<number>;

/**
 * The ONE place the entitlement clamp is composed — deliberately, because it has to hold on two
 * surfaces at once. `POST /v1/compile` (@tessera/api) and the `compile_context` / `explain` MCP
 * tools (@tessera/mcp) both build their clamp here, so the rule cannot be extended on one surface
 * and forgotten on the other. Two copies of an entitlement rule WILL drift (the F-060/F-061
 * lesson); F-077 exists because MCP simply never had one.
 *
 * **The metering rule (ADR-0056): a deployment that wired a {@link BillingProvider} is metered; one
 * that did not is self-hosted and is NOT capped.** Passing `undefined` therefore yields a
 * pass-through, not a free-tier clamp. That is the whole decision in one line:
 *
 * - NFR-12 is *cost control* — "Local-default avoids API spend; cloud tracks per-tenant usage/cost".
 *   A self-hosted operator runs their own hardware and spends their own money; there is no cost for
 *   us to control and no tenant to meter, so a cap there protects nobody and just throttles the
 *   open-core promise ("free forever where your code lives").
 * - The cloud **Free plan keeps its 8000 cap** — the plan catalog is untouched, and a metered
 *   deployment whose tenant is on `free` clamps exactly as before. Local is not "the free plan"; it
 *   is *unmetered*, which the previous `?? createLocalBilling()` fallback conflated.
 *
 * Never raises a budget: {@link clampBudgetToPlan} only ever caps.
 */
export function createCompileBudgetClamp(billing?: BillingProvider): CompileBudgetClamp {
  if (billing === undefined) {
    return (_tenantId, requestedBudget) => Promise.resolve(requestedBudget);
  }
  return async (tenantId, requestedBudget) =>
    clampBudgetToPlan(
      effectiveEntitlements(await billing.getSubscription(tenantId)),
      requestedBudget,
    );
}
