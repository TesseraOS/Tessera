import type { PlanId, Subscription, SubscriptionStatus } from '../domain.js';

/** The stored column shape, identical in both backends. */
export interface SubscriptionRow {
  readonly tenantId: string;
  readonly planId: PlanId;
  readonly status: SubscriptionStatus;
  readonly currentPeriodEnd: string | null;
  readonly externalId: string | null;
}

/**
 * Project a stored row back to the domain shape — shared by the SQLite and Postgres adapters so the
 * two cannot disagree about what a stored subscription reads back as.
 *
 * `externalId` is **omitted** rather than set to `undefined` when the column is NULL: the port declares
 * it optional, and `freeSubscription()` — the object the local adapter hands back — simply has no such
 * key. Materializing `externalId: undefined` would make a stored free subscription unequal to a freshly
 * built one, which the conformance suite asserts against.
 */
export function toSubscription(row: SubscriptionRow): Subscription {
  return {
    tenantId: row.tenantId,
    planId: row.planId,
    status: row.status,
    currentPeriodEnd: row.currentPeriodEnd,
    ...(row.externalId === null ? {} : { externalId: row.externalId }),
  };
}
