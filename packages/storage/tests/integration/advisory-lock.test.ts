import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  TESSERA_MIGRATION_LOCK_KEY,
  withPgAdvisoryLock,
} from '../../src/adapters/postgres-relational/advisory-lock';
import { createPostgresStore } from '../../src/adapters/postgres-relational/index';
import { pgClientMigrationDb, runMigrations } from '../../src/migrations/runner';

// Guarded like the other Postgres suites (F-023): `docker compose up -d postgres`, then
// TESSERA_TEST_POSTGRES=1. An advisory lock cannot be exercised against SQLite, so there is no
// in-memory fallback — an offline machine skips.
const CONNECTION_STRING =
  process.env['DATABASE_URL'] ?? 'postgres://tessera:tessera@127.0.0.1:5432/tessera';
const enabled = process.env['TESSERA_TEST_POSTGRES'] === '1';

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!enabled)('pg advisory lock + migration seam (TESSERA_TEST_POSTGRES=1)', () => {
  it('serializes concurrent critical sections rather than interleaving them', async () => {
    const store = createPostgresStore({ connectionString: CONNECTION_STRING });
    // A key of its own, so a real migration lock in the same database cannot affect this.
    const key = 0x7e55e7a_0000_0f01n;
    const log: string[] = [];

    try {
      const section = async (name: string): Promise<void> => {
        await withPgAdvisoryLock(store.pool, key, async () => {
          log.push(`start-${name}`);
          await delay(60); // a window wide enough for the other section to interleave, if it could
          log.push(`end-${name}`);
        });
      };

      await Promise.all([section('a'), section('b')]);

      // Whoever wins, the sections do not overlap. Without the lock this reads start,start,end,end.
      expect(log).toHaveLength(4);
      expect([log.join(','), log.join(',')]).toContain(
        log[0] === 'start-a' ? 'start-a,end-a,start-b,end-b' : 'start-b,end-b,start-a,end-a',
      );
    } finally {
      await store.close();
    }
  });

  it('releases the lock when the critical section throws', async () => {
    const store = createPostgresStore({ connectionString: CONNECTION_STRING });
    const key = 0x7e55e7a_0000_0f02n;
    try {
      await expect(
        withPgAdvisoryLock(store.pool, key, () => Promise.reject(new Error('boom'))),
      ).rejects.toThrow('boom');

      // If the lock leaked, this would hang until the test timed out.
      await expect(withPgAdvisoryLock(store.pool, key, () => Promise.resolve('ok'))).resolves.toBe(
        'ok',
      );
    } finally {
      await store.close();
    }
  });

  it('lets two concurrent replicas migrate a fresh schema exactly once', async () => {
    // The case this seam exists for (ADR-0059 §2). `runMigrations` reads applied ids then applies,
    // so two unlocked replicas both see an empty table and both apply. The migration below is a bare
    // CREATE TABLE — no IF NOT EXISTS — so a double-apply is a hard error, not a silent no-op.
    const store = createPostgresStore({ connectionString: CONNECTION_STRING });
    const schema = `mig_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
    const table = `${schema}.widgets`;

    try {
      await store.db.execute(sql.raw(`CREATE SCHEMA ${schema}`));

      const migrations = [
        { id: 'f056-widgets-001', up: `CREATE TABLE ${table} (id integer PRIMARY KEY)` },
      ];

      const replica = (): Promise<{ applied: readonly string[]; skipped: readonly string[] }> =>
        withPgAdvisoryLock(store.pool, TESSERA_MIGRATION_LOCK_KEY, async (client) => {
          // Point the migration bookkeeping at this schema too, so the suite leaves nothing behind.
          await client.query(`SET search_path TO ${schema}`);
          return runMigrations(pgClientMigrationDb(client), migrations);
        });

      const [first, second] = await Promise.all([replica(), replica()]);

      // Exactly one replica applied it; the other found it recorded and skipped.
      const appliedCount = [first, second].filter((r) => r.applied.includes(migrations[0]!.id));
      const skippedCount = [first, second].filter((r) => r.skipped.includes(migrations[0]!.id));
      expect(appliedCount).toHaveLength(1);
      expect(skippedCount).toHaveLength(1);

      // And the table exists exactly once, with the bookkeeping row to match.
      const recorded = await store.db.execute(
        sql.raw(`SELECT id FROM ${schema}._tessera_migrations`),
      );
      expect(recorded.rows).toHaveLength(1);
    } finally {
      await store.db.execute(sql.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`));
      await store.close();
    }
  });
});
