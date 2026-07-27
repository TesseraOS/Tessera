import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  createPostgresStore,
  pgClientMigrationDb,
  runMigrations,
  withPgAdvisoryLock,
} from '@tessera/storage';
import {
  createPostgresUsageStore,
  pgUsageMigrations,
} from '../../src/usage/adapters/postgres-usage-store';
import { runUsageStoreConformance } from '../conformance/usage-store.conformance';

// Guarded like the F-023/F-056 Postgres suites: `docker compose up -d postgres`, then
// TESSERA_TEST_POSTGRES=1. Offline machines skip and stay green.
const CONNECTION_STRING =
  process.env['DATABASE_URL'] ?? 'postgres://tessera:tessera@127.0.0.1:5432/tessera';
const enabled = process.env['TESSERA_TEST_POSTGRES'] === '1';

let schemaCounter = 0;

/**
 * A fresh Postgres schema per harness (ADR-0059 §3). Isolation via `search_path` rather than a
 * `tableName` option on the adapter — a test concern does not belong in a production constructor.
 */
async function freshStore(): Promise<{
  store: ReturnType<typeof createPostgresUsageStore>;
  pool: ReturnType<typeof createPostgresStore>;
  cleanup: () => Promise<void>;
}> {
  schemaCounter += 1;
  const schema = `usage_${Date.now().toString(36)}_${schemaCounter}`;
  const admin = createPostgresStore({ connectionString: CONNECTION_STRING });
  await admin.db.execute(sql.raw(`CREATE SCHEMA ${schema}`));
  await admin.close();

  const scoped = createPostgresStore({
    connectionString: `${CONNECTION_STRING}?options=-c%20search_path%3D${schema}`,
  });
  await withPgAdvisoryLock(scoped.pool, 0x7e55e7a_0000_0003n, async (client) => {
    await client.query(`SET search_path TO ${schema}`);
    await runMigrations(pgClientMigrationDb(client), pgUsageMigrations);
  });

  return {
    store: createPostgresUsageStore(scoped.db),
    pool: scoped,
    cleanup: async () => {
      await scoped.db.execute(sql.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`));
      await scoped.close();
    },
  };
}

describe.skipIf(!enabled)('postgres usage store (TESSERA_TEST_POSTGRES=1)', () => {
  // The Postgres adapter must satisfy the SAME shared contract, unmodified — including the
  // "returns numbers, not strings" case, which only this adapter can actually fail.
  runUsageStoreConformance('postgres', freshStore);

  it('upserts into one physical row rather than raising a duplicate key', async () => {
    // Mutation check (measured): setting `count: sql\`1\`` in the conflict clause — replacing instead
    // of accumulating — turns this red along with 4 cases in the shared suite.
    const { store, pool, cleanup } = await freshStore();
    try {
      for (const durationMs of [10, 20, 30]) {
        await store.record({
          tenantId: 'tenant-a',
          projectId: 'project-a',
          operation: 'compile',
          occurredAt: '2026-05-04T06:00:00.000Z',
          durationMs,
          tokens: 100,
        });
      }

      const rows = await pool.db.execute<{ n: string }>(
        sql`SELECT count(*) AS n FROM usage_buckets`,
      );
      expect(Number(rows.rows[0]?.n)).toBe(1);

      const [summary] = await store.summarize({
        tenantId: 'tenant-a',
        from: '2026-05-01',
        until: '2026-05-31',
      });
      expect(summary).toMatchObject({
        count: 3,
        tokens: 300,
        sumDurationMs: 60,
        maxDurationMs: 30,
      });
    } finally {
      await cleanup();
    }
  });

  it('keeps a summed duration exact past float4 precision (double precision, not real)', async () => {
    // The value matters. PG formats float4 with shortest-round-trip text, so a small number does NOT
    // discriminate — float4 carries ~7 significant digits, and an accumulating SUM crosses that after
    // a few hours of recorded time. Verified by mutation: switching the columns to `real` turns this
    // red and nothing else.
    const { store, cleanup } = await freshStore();
    try {
      await store.record({
        tenantId: 'tenant-a',
        projectId: 'project-a',
        operation: 'compile',
        occurredAt: '2026-05-04T06:00:00.000Z',
        durationMs: 123456789.012345,
      });

      const [summary] = await store.summarize({
        tenantId: 'tenant-a',
        from: '2026-05-01',
        until: '2026-05-31',
      });
      expect(summary?.sumDurationMs).toBe(123456789.012345);
    } finally {
      await cleanup();
    }
  });

  it('accumulates correctly under concurrent recorders (the increment happens in the database)', async () => {
    // Read-modify-write in the adapter would lose updates here; `count = count + 1` inside an
    // ON CONFLICT DO UPDATE cannot, because the row is locked for the duration of the statement.
    // This is the property a multi-replica self-hosted deployment depends on.
    const { store, cleanup } = await freshStore();
    try {
      await Promise.all(
        Array.from({ length: 25 }, () =>
          store.record({
            tenantId: 'tenant-a',
            projectId: 'project-a',
            operation: 'search',
            occurredAt: '2026-05-04T06:00:00.000Z',
            durationMs: 4,
          }),
        ),
      );

      const [summary] = await store.summarize({
        tenantId: 'tenant-a',
        from: '2026-05-01',
        until: '2026-05-31',
      });
      expect(summary?.count).toBe(25);
      expect(summary?.sumDurationMs).toBe(100);
    } finally {
      await cleanup();
    }
  });
});
