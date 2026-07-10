import { PLAN_IDS, PLANS, type Entitlements, type Plan, type PlanId } from '@tessera/billing';

/**
 * Pricing display model (MARKETING-DESIGN §3.8, ADR-0045 v4.4): every number on the
 * pricing page is DERIVED from the @tessera/billing PLANS catalog — the same values the
 * API enforces. Nothing here is hand-copied; tests/pricing.test.ts proves it.
 */
export interface PlanDisplay {
  readonly id: PlanId;
  readonly name: string;
  /** Derived from priceCents — "$0", "$29", or "Custom" for contact-sales tiers. */
  readonly price: string;
  /** The qualifier under the price — "forever", "per month", "contact sales". */
  readonly cadence: string;
  /** Entitlement lines derived from the plan's Entitlements (`-1` renders unlimited). */
  readonly entitlements: readonly string[];
}

const formatCount = (value: number): string => value.toLocaleString('en-US');

export function formatPrice(plan: Plan): string {
  if (plan.priceCents > 0) {
    const dollars = plan.priceCents / 100;
    return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
  }
  // priceCents === 0 means "free" only on the free plan; elsewhere it means contact-sales.
  return plan.id === 'free' ? '$0' : 'Custom';
}

export function formatCadence(plan: Plan): string {
  if (plan.priceCents > 0 && plan.interval) return `per ${plan.interval}`;
  return plan.id === 'free' ? 'forever' : 'contact sales';
}

export function entitlementLines(entitlements: Entitlements): readonly string[] {
  const compiles =
    entitlements.maxMonthlyCompiles < 0
      ? 'Unlimited compiles'
      : `${formatCount(entitlements.maxMonthlyCompiles)} compiles per month`;
  const seats =
    entitlements.maxSeats < 0
      ? 'Unlimited seats'
      : entitlements.maxSeats === 1
        ? '1 seat'
        : `${formatCount(entitlements.maxSeats)} seats`;
  const budget =
    entitlements.maxTokensPerCompile < 0
      ? 'Unbounded compile budget'
      : `${formatCount(entitlements.maxTokensPerCompile)}-token compile budget`;
  return [compiles, seats, budget];
}

/** The catalog, projected for the pricing table — stable PLAN_IDS order. */
export function planDisplays(): readonly PlanDisplay[] {
  return PLAN_IDS.map((id) => {
    const plan = PLANS[id];
    return {
      id,
      name: plan.name,
      price: formatPrice(plan),
      cadence: formatCadence(plan),
      entitlements: entitlementLines(plan.entitlements),
    };
  });
}
