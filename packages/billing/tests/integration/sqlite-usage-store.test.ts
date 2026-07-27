import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createSqliteStore } from '@tessera/storage';
import { createSqliteUsageStore } from '../../src/usage/adapters/sqlite-usage-store';
import { runUsageStoreConformance } from '../conformance/usage-store.conformance';

// The SQLite UsageStore must satisfy the SAME shared contract the in-memory reference adapter does.
runUsageStoreConformance('sqlite', () => {
  const sqlite = createSqliteStore({ path: ':memory:' });
  return Promise.resolve({
    store: createSqliteUsageStore(sqlite.db),
    cleanup: () => sqlite.close(),
  });
});

describe('sqlite usage store — upsert semantics', () => {
  it('accumulates into one row rather than inserting a second', async () => {
    // The conformance suite proves the READ is right; this proves the WRITE is an upsert and not two
    // rows that happen to sum correctly. Mutation check (measured): `onConflictDoUpdate` ->
    // `onConflictDoNothing` turns 4 tests red — the second record is silently dropped rather than
    // accumulated, which is the realistic slip. Removing the clause entirely raises a UNIQUE violation.
    const sqlite = createSqliteStore({ path: ':memory:' });
    try {
      const store = createSqliteUsageStore(sqlite.db);
      await store.record({
        tenantId: 'tenant-a',
        projectId: 'project-a',
        operation: 'compile',
        occurredAt: '2026-05-04T01:00:00.000Z',
        durationMs: 10,
      });
      await store.record({
        tenantId: 'tenant-a',
        projectId: 'project-a',
        operation: 'compile',
        occurredAt: '2026-05-04T23:00:00.000Z',
        durationMs: 20,
      });

      // Raw count of PHYSICAL rows — the aggregate API cannot distinguish one row of count 2 from
      // two rows of count 1, and that difference is the whole point of pre-aggregation.
      const rows = sqlite.db.all<{ n: number }>(sql`SELECT count(*) AS n FROM usage_buckets`);
      expect(rows[0]?.n).toBe(1);
    } finally {
      await sqlite.close();
    }
  });

  it('persists across store instances over the same database', async () => {
    // A new adapter over the same handle must see what the previous one recorded — the property the
    // Local profile depends on, and the one the in-memory reference adapter cannot provide.
    const sqlite = createSqliteStore({ path: ':memory:' });
    try {
      await createSqliteUsageStore(sqlite.db).record({
        tenantId: 'tenant-a',
        projectId: 'project-a',
        operation: 'search',
        occurredAt: '2026-05-04T01:00:00.000Z',
        durationMs: 10,
      });

      const reopened = createSqliteUsageStore(sqlite.db);
      const summary = await reopened.summarize({
        tenantId: 'tenant-a',
        from: '2026-05-01',
        until: '2026-05-31',
      });
      expect(summary).toEqual([
        expect.objectContaining({ operation: 'search', count: 1, sumDurationMs: 10 }),
      ]);
    } finally {
      await sqlite.close();
    }
  });
});
