import { clampBudgetToPlan, effectiveEntitlements } from './domain.js';
import type { BillingProvider } from './ports.js';

/**
 * Resolve a requested compile budget to the effective one for a tenant (NFR-12; F-035, F-077).
 *
 * Returned by {@link createCompileBudgetClamp} and called per compile.
 */
export type CompileBudgetClamp = (tenantId: string, requestedBudget: number) => Promise<number>;

/**
 * What an entitlement rule needs to know about a deployment (ADR-0060 §1).
 *
 * Both `createCompileBudgetClamp` and the monthly compile guard take this same shape, so there is
 * exactly **one** definition of "metered" in the package. Two definitions in one package is how the
 * F-060/F-061 drift starts.
 */
export interface EntitlementContext {
  /** The provider entitlements are read from. Absent ⇒ nothing to enforce. */
  readonly billing?: BillingProvider;
  /**
   * Whether this deployment is metered — `config.billing.provider !== 'none'`.
   *
   * **Explicit, never inferred from `billing !== undefined`.** The composition root always wires a
   * provider (`createLocalBilling()` for `provider: 'none'`), so inference caps every Local and
   * self-hosted deployment at the cloud free tier. Defaults to `false`: an unmetered deployment is
   * the safe assumption, and a caller that means to meter has to say so.
   */
  readonly metered?: boolean;
}

/**
 * The ONE place the entitlement clamp is composed — deliberately, because it has to hold on two
 * surfaces at once. `POST /v1/compile` (@tessera/api) and the `compile_context` / `explain` MCP
 * tools (@tessera/mcp) both build their clamp here, so the rule cannot be extended on one surface
 * and forgotten on the other. Two copies of an entitlement rule WILL drift (the F-060/F-061
 * lesson); F-077 exists because MCP simply never had one.
 *
 * **The metering rule (ADR-0056, mechanism corrected by ADR-0060 §1): a METERED deployment is
 * capped; an unmetered one is self-hosted and is NOT.** `metered` is now an explicit flag rather than
 * "is a `BillingProvider` object present", because the composition root **always** wires one —
 * `createRuntimeBilling` returns `createLocalBilling()` for `provider: 'none'`, and that adapter
 * reports every tenant as free. Under the old predicate every runtime-composed Local and self-hosted
 * deployment was therefore capped at the cloud free tier's 8000 tokens: exactly the outcome ADR-0056
 * decided against and listed as a Positive it had prevented. It had not.
 *
 * The rule itself is unchanged; only the way a deployment is recognized is:
 *
 * - NFR-12 is *cost control* — "Local-default avoids API spend; cloud tracks per-tenant usage/cost".
 *   A self-hosted operator runs their own hardware and spends their own money; there is no cost for
 *   us to control and no tenant to meter, so a cap there protects nobody and just throttles the
 *   open-core promise ("free forever where your code lives").
 * - The cloud **Free plan keeps its 8000 cap** — the plan catalog is untouched, and a metered
 *   deployment whose tenant is on `free` clamps exactly as before. Local is not "the free plan"; it
 *   is *unmetered*, which both the old `?? createLocalBilling()` fallback and the object-presence
 *   predicate that replaced it conflated.
 *
 * Never raises a budget: {@link clampBudgetToPlan} only ever caps.
 */
export function createCompileBudgetClamp(options: EntitlementContext = {}): CompileBudgetClamp {
  const { billing, metered = false } = options;
  if (billing === undefined || !metered) {
    return (_tenantId, requestedBudget) => Promise.resolve(requestedBudget);
  }
  return async (tenantId, requestedBudget) =>
    clampBudgetToPlan(
      effectiveEntitlements(await billing.getSubscription(tenantId)),
      requestedBudget,
    );
}
