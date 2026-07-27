import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createSqliteStore } from '@tessera/storage';
import { createSqliteSubscriptionStore } from '../../src/adapters/sqlite-subscription-store';
import { runSubscriptionStoreConformance } from '../conformance/subscription-store.conformance';

// The SQLite adapter must satisfy the SAME shared contract the in-memory reference adapter does.
runSubscriptionStoreConformance('sqlite', () => {
  const sqlite = createSqliteStore({ path: ':memory:' });
  return Promise.resolve({
    store: createSqliteSubscriptionStore(sqlite.db),
    cleanup: () => sqlite.close(),
  });
});

describe('sqlite subscription store — durability and row identity', () => {
  it('keeps exactly one physical row per tenant across repeated upserts', async () => {
    // The conformance suite proves `get` returns the newest plan; only a raw row count proves the
    // older ones are gone rather than shadowed. A webhook stream produces many updates for one
    // subscription, so an appending store would grow without bound AND depend on read order.
    const sqlite = createSqliteStore({ path: ':memory:' });
    try {
      const store = createSqliteSubscriptionStore(sqlite.db);
      for (const planId of ['free', 'pro', 'enterprise', 'pro'] as const) {
        await store.upsert({
          tenantId: 'tenant-a',
          planId,
          status: 'active',
          currentPeriodEnd: null,
        });
      }

      const rows = sqlite.db.all<{ n: number }>(sql`SELECT count(*) AS n FROM subscriptions`);
      expect(rows[0]?.n).toBe(1);
      expect((await store.get('tenant-a'))?.planId).toBe('pro');
    } finally {
      await sqlite.close();
    }
  });

  it('survives a new store instance over the same database — the F-030 seam, closed', async () => {
    // This is the whole point of the feature clause: plan state that outlives the process. The
    // in-memory adapter passes every conformance case above and fails exactly this one.
    const sqlite = createSqliteStore({ path: ':memory:' });
    try {
      await createSqliteSubscriptionStore(sqlite.db).upsert({
        tenantId: 'tenant-a',
        planId: 'enterprise',
        status: 'active',
        currentPeriodEnd: '2027-01-01T00:00:00.000Z',
        externalId: 'sub_live_1',
      });

      const reopened = createSqliteSubscriptionStore(sqlite.db);
      expect(await reopened.get('tenant-a')).toEqual({
        tenantId: 'tenant-a',
        planId: 'enterprise',
        status: 'active',
        currentPeriodEnd: '2027-01-01T00:00:00.000Z',
        externalId: 'sub_live_1',
      });
    } finally {
      await sqlite.close();
    }
  });
});
