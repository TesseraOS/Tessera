import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  createPostgresStore,
  pgClientMigrationDb,
  runMigrations,
  withPgAdvisoryLock,
} from '@tessera/storage';
import {
  createPostgresSubscriptionStore,
  pgSubscriptionMigrations,
} from '../../src/adapters/postgres-subscription-store';
import { runSubscriptionStoreConformance } from '../conformance/subscription-store.conformance';

// Guarded like the other Postgres suites: `docker compose up -d postgres`, then TESSERA_TEST_POSTGRES=1.
const CONNECTION_STRING =
  process.env['DATABASE_URL'] ?? 'postgres://tessera:tessera@127.0.0.1:5432/tessera';
const enabled = process.env['TESSERA_TEST_POSTGRES'] === '1';

let schemaCounter = 0;

async function freshStore(): Promise<{
  store: ReturnType<typeof createPostgresSubscriptionStore>;
  pool: ReturnType<typeof createPostgresStore>;
  cleanup: () => Promise<void>;
}> {
  schemaCounter += 1;
  const schema = `subs_${Date.now().toString(36)}_${schemaCounter}`;
  const admin = createPostgresStore({ connectionString: CONNECTION_STRING });
  await admin.db.execute(sql.raw(`CREATE SCHEMA ${schema}`));
  await admin.close();

  const scoped = createPostgresStore({
    connectionString: `${CONNECTION_STRING}?options=-c%20search_path%3D${schema}`,
  });
  await withPgAdvisoryLock(scoped.pool, 0x7e55e7a_0000_0004n, async (client) => {
    await client.query(`SET search_path TO ${schema}`);
    await runMigrations(pgClientMigrationDb(client), pgSubscriptionMigrations);
  });

  return {
    store: createPostgresSubscriptionStore(scoped.db),
    pool: scoped,
    cleanup: async () => {
      await scoped.db.execute(sql.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`));
      await scoped.close();
    },
  };
}

describe.skipIf(!enabled)('postgres subscription store (TESSERA_TEST_POSTGRES=1)', () => {
  runSubscriptionStoreConformance('postgres', freshStore);

  it('keeps exactly one physical row per tenant across repeated upserts', async () => {
    const { store, pool, cleanup } = await freshStore();
    try {
      for (const planId of ['free', 'pro', 'enterprise'] as const) {
        await store.upsert({
          tenantId: 'tenant-a',
          planId,
          status: 'active',
          currentPeriodEnd: null,
        });
      }

      const rows = await pool.db.execute<{ n: string }>(
        sql`SELECT count(*) AS n FROM subscriptions`,
      );
      expect(Number(rows.rows[0]?.n)).toBe(1);
      expect((await store.get('tenant-a'))?.planId).toBe('enterprise');
    } finally {
      await cleanup();
    }
  });

  it('applies concurrent webhook updates without losing the row or raising a duplicate key', async () => {
    // Real webhook streams are concurrent and retried. `ON CONFLICT DO UPDATE` makes a racing pair
    // converge on one row; a read-then-insert would raise a unique violation under exactly this load.
    const { store, pool, cleanup } = await freshStore();
    try {
      await Promise.all(
        (['pro', 'enterprise', 'pro', 'free'] as const).map((planId) =>
          store.upsert({
            tenantId: 'tenant-a',
            planId,
            status: 'active',
            currentPeriodEnd: null,
          }),
        ),
      );

      const rows = await pool.db.execute<{ n: string }>(
        sql`SELECT count(*) AS n FROM subscriptions`,
      );
      expect(Number(rows.rows[0]?.n)).toBe(1);
      // Which plan wins is genuinely undefined under a race — the store's job is that exactly one
      // does, and that it is one of the plans actually sent. Asserting a specific winner here would
      // be asserting scheduler order, which is not a property this store has or should have.
      expect(['pro', 'enterprise', 'free']).toContain((await store.get('tenant-a'))?.planId);
    } finally {
      await cleanup();
    }
  });
});
