/**
 * Billing domain (F-030; FR-61, NFR-12) — plans, entitlements, and subscription state. Pure data +
 * pure functions; no I/O and no provider SDK. Tessera is **open-core**: the model + the local/free
 * adapter are OSS; a paid Managed Cloud tier is served by the Dodo adapter (ADR-0011/0031).
 */

/** Subscription tiers. `free` is the OSS/local default; `pro`/`enterprise` are the paid cloud tiers. */
export const PLAN_IDS = ['free', 'pro', 'enterprise'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

/** Per-plan limits enforced by the surfaces. `-1` means unlimited. */
export interface Entitlements {
  /** Context compilations per calendar month. */
  readonly maxMonthlyCompiles: number;
  /** Seats (collaborating users) in the org. */
  readonly maxSeats: number;
  /** Upper bound on a single compile's token budget. */
  readonly maxTokensPerCompile: number;
}

export interface Plan {
  readonly id: PlanId;
  readonly name: string;
  /** Price per {@link Plan.interval} in minor units (cents); `0` for free / contact-sales. */
  readonly priceCents: number;
  /** Billing interval, or `null` for the free plan. */
  readonly interval: 'month' | 'year' | null;
  readonly entitlements: Entitlements;
}

/** The plan catalog — the single source of truth for pricing + entitlements. */
export const PLANS: Readonly<Record<PlanId, Plan>> = {
  free: {
    id: 'free',
    name: 'Free',
    priceCents: 0,
    interval: null,
    entitlements: { maxMonthlyCompiles: 200, maxSeats: 1, maxTokensPerCompile: 8000 },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceCents: 2900,
    interval: 'month',
    entitlements: { maxMonthlyCompiles: 5000, maxSeats: 10, maxTokensPerCompile: 32000 },
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    // Contact-sales pricing; `0` here means "not self-serve", not "free".
    priceCents: 0,
    interval: 'month',
    entitlements: { maxMonthlyCompiles: -1, maxSeats: -1, maxTokensPerCompile: 128000 },
  },
};

/** Every plan as a list (stable order), for `GET /v1/billing/plans`. */
export function listPlans(): readonly Plan[] {
  return PLAN_IDS.map((id) => PLANS[id]);
}

export function entitlementsFor(planId: PlanId): Entitlements {
  return PLANS[planId].entitlements;
}

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled';

/** Statuses that grant the plan's entitlements (a canceled/past-due sub falls back to free). */
export function isEntitled(status: SubscriptionStatus): boolean {
  return status === 'active' || status === 'trialing';
}

export interface Subscription {
  readonly tenantId: string;
  readonly planId: PlanId;
  readonly status: SubscriptionStatus;
  /** ISO end of the current paid period, or `null` for the free plan. */
  readonly currentPeriodEnd: string | null;
  /** The provider's subscription id (Dodo), when applicable. */
  readonly externalId?: string;
}

/** The default subscription for a tenant with no paid plan — active, free, no expiry. */
export function freeSubscription(tenantId: string): Subscription {
  return { tenantId, planId: 'free', status: 'active', currentPeriodEnd: null };
}

/** The entitlements a subscription currently grants (an un-entitled status falls back to free). */
export function effectiveEntitlements(subscription: Subscription): Entitlements {
  return entitlementsFor(isEntitled(subscription.status) ? subscription.planId : 'free');
}

/**
 * Clamp a requested context-compilation token budget to the plan's `maxTokensPerCompile` (NFR-12
 * entitlement enforcement). `-1` means unlimited (no clamp); otherwise the effective budget is
 * `min(requested, limit)`. Never raises a budget — only caps it.
 */
export function clampBudgetToPlan(entitlements: Entitlements, requestedBudget: number): number {
  const max = entitlements.maxTokensPerCompile;
  return max < 0 ? requestedBudget : Math.min(requestedBudget, max);
}
