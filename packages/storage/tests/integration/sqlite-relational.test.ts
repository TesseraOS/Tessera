import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createSqliteStore } from '../../src/adapters/sqlite-relational/index';
import { runRelationalConformance } from '../conformance/relational.conformance';

// The SQLite adapter must satisfy the shared RelationalStore contract.
runRelationalConformance('sqlite', async () => {
  const store = createSqliteStore({ path: ':memory:' });
  return { store, cleanup: () => store.close() };
});

// Adapter-specific: prove Drizzle + better-sqlite3 execute a real query round-trip.
describe('sqlite adapter — Drizzle query round-trip', () => {
  it('creates a table, inserts, and reads back', async () => {
    const store = createSqliteStore({ path: ':memory:' });
    try {
      store.db.run(sql`CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT NOT NULL)`);
      store.db.run(sql`INSERT INTO t (v) VALUES ('hello')`);
      const rows = store.db.all<{ id: number; v: string }>(sql`SELECT id, v FROM t`);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.v).toBe('hello');
    } finally {
      await store.close();
    }
  });
});
