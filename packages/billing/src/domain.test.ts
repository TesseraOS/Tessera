import { describe, expect, it } from 'vitest';
import {
  clampBudgetToPlan,
  effectiveEntitlements,
  entitlementsFor,
  freeSubscription,
  isEntitled,
  listPlans,
  PLAN_IDS,
  PLANS,
} from './domain.js';

describe('billing domain', () => {
  it('exposes a plan for every id, in catalog order', () => {
    expect(listPlans().map((p) => p.id)).toEqual([...PLAN_IDS]);
    expect(PLANS.free.priceCents).toBe(0);
    expect(PLANS.pro.interval).toBe('month');
  });

  it('free plan entitlements are the most restrictive; enterprise is unlimited', () => {
    expect(entitlementsFor('free').maxSeats).toBe(1);
    expect(entitlementsFor('enterprise').maxMonthlyCompiles).toBe(-1);
  });

  it('a tenant with no subscription is active on free', () => {
    const sub = freeSubscription('acme');
    expect(sub).toMatchObject({ tenantId: 'acme', planId: 'free', status: 'active' });
    expect(sub.currentPeriodEnd).toBeNull();
  });

  it('grants a plan only for entitled statuses; falls back to free otherwise', () => {
    expect(isEntitled('active')).toBe(true);
    expect(isEntitled('trialing')).toBe(true);
    expect(isEntitled('past_due')).toBe(false);
    expect(isEntitled('canceled')).toBe(false);

    const activePro = {
      tenantId: 't',
      planId: 'pro',
      status: 'active',
      currentPeriodEnd: null,
    } as const;
    expect(effectiveEntitlements(activePro)).toEqual(entitlementsFor('pro'));

    const canceledPro = { ...activePro, status: 'canceled' } as const;
    expect(effectiveEntitlements(canceledPro)).toEqual(entitlementsFor('free'));
  });

  it('clamps a compile budget to the plan (unlimited = no clamp)', () => {
    expect(clampBudgetToPlan(entitlementsFor('free'), 50000)).toBe(8000);
    expect(clampBudgetToPlan(entitlementsFor('free'), 4000)).toBe(4000);
    expect(clampBudgetToPlan(entitlementsFor('pro'), 50000)).toBe(32000);
    expect(clampBudgetToPlan(entitlementsFor('enterprise'), 500000)).toBe(128000);
    // -1 means unlimited → the request passes through unclamped.
    expect(
      clampBudgetToPlan({ maxMonthlyCompiles: -1, maxSeats: -1, maxTokensPerCompile: -1 }, 500000),
    ).toBe(500000);
  });
});
