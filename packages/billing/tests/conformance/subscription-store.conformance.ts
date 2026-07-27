import { describe, expect, it } from 'vitest';
import type { Subscription } from '../../src/domain';
import type { SubscriptionStore } from '../../src/ports';

export interface SubscriptionStoreHarness {
  store: SubscriptionStore;
  cleanup?: () => Promise<void>;
}

/** Builds a fresh, isolated SubscriptionStore for each test. */
export type SubscriptionStoreFactory = () => Promise<SubscriptionStoreHarness>;

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    tenantId: 'tenant-a',
    planId: 'pro',
    status: 'active',
    currentPeriodEnd: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * The behavioral contract every {@link SubscriptionStore} adapter must satisfy (ADR-0060 §7).
 *
 * The port shipped with one in-memory implementation and **no** suite (F-030), which is how three
 * adapters drift — F-078 is the same failure one package over. Written against the in-memory reference
 * and run unmodified by SQLite and Postgres.
 */
export function runSubscriptionStoreConformance(
  name: string,
  makeStore: SubscriptionStoreFactory,
): void {
  describe(`SubscriptionStore conformance: ${name}`, () => {
    it('round-trips a subscription', async () => {
      const { store, cleanup } = await makeStore();
      try {
        const pro = subscription();
        await store.upsert(pro);
        expect(await store.get('tenant-a')).toEqual(pro);
      } finally {
        await cleanup?.();
      }
    });

    it('returns null for a tenant it has never seen', async () => {
      // Not a free subscription — the PROVIDER decides the fallback (`getSubscription` does that).
      // A store that invented a free plan here would make "never subscribed" and "downgraded to free"
      // indistinguishable, and only one of those should survive a webhook replay.
      const { store, cleanup } = await makeStore();
      try {
        expect(await store.get('tenant-unknown')).toBeNull();
      } finally {
        await cleanup?.();
      }
    });

    it('replaces rather than appends — a tenant has exactly one current subscription', async () => {
      // This is the case the port never had a test for, and the one that decides whether a webhook
      // stream leaves a tenant on the plan it last paid for or on the first plan it ever bought.
      // Mutation check: an INSERT without the conflict clause turns this red on all three adapters at
      // once, which is the property this shared suite exists to buy.
      const { store, cleanup } = await makeStore();
      try {
        await store.upsert(subscription({ planId: 'pro', status: 'active' }));
        await store.upsert(
          subscription({ planId: 'enterprise', status: 'active', externalId: 'sub_123' }),
        );

        expect(await store.get('tenant-a')).toEqual(
          subscription({ planId: 'enterprise', status: 'active', externalId: 'sub_123' }),
        );
      } finally {
        await cleanup?.();
      }
    });

    it('round-trips a cancellation — the row is updated in place, not deleted', async () => {
      // `canceled` must remain READABLE: `effectiveEntitlements` falls back to free for an un-entitled
      // status, but the plan the tenant was on is billing history. Deleting on cancel would erase it.
      const { store, cleanup } = await makeStore();
      try {
        await store.upsert(subscription({ planId: 'pro', status: 'active' }));
        await store.upsert(subscription({ planId: 'pro', status: 'canceled' }));

        const read = await store.get('tenant-a');
        expect(read?.status).toBe('canceled');
        expect(read?.planId).toBe('pro');
      } finally {
        await cleanup?.();
      }
    });

    it('round-trips a null currentPeriodEnd and an absent externalId', async () => {
      // `freeSubscription()` is exactly this shape, and it is what the local adapter hands back — so a
      // store that coerced `null` to a string, or materialized `externalId: undefined` as a key, would
      // fail an equality check against a subscription the system itself produces.
      const { store, cleanup } = await makeStore();
      try {
        const free = subscription({ planId: 'free', currentPeriodEnd: null });
        await store.upsert(free);

        const read = await store.get('tenant-a');
        expect(read).toEqual(free);
        expect(read?.currentPeriodEnd).toBeNull();
        expect(read && 'externalId' in read).toBe(false);
      } finally {
        await cleanup?.();
      }
    });

    it('keeps tenants apart', async () => {
      // Mutation check: dropping tenant_id from the WHERE clause turns this red — and a cross-tenant
      // read here would hand one customer another customer's plan.
      const { store, cleanup } = await makeStore();
      try {
        await store.upsert(subscription({ tenantId: 'tenant-a', planId: 'pro' }));
        await store.upsert(subscription({ tenantId: 'tenant-b', planId: 'enterprise' }));

        expect((await store.get('tenant-a'))?.planId).toBe('pro');
        expect((await store.get('tenant-b'))?.planId).toBe('enterprise');
      } finally {
        await cleanup?.();
      }
    });

    it('preserves every status the domain defines', async () => {
      const { store, cleanup } = await makeStore();
      try {
        for (const status of ['active', 'trialing', 'past_due', 'canceled'] as const) {
          await store.upsert(subscription({ status }));
          expect((await store.get('tenant-a'))?.status).toBe(status);
        }
      } finally {
        await cleanup?.();
      }
    });
  });
}
