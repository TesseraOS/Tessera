import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createPostgresStore } from '../../src/adapters/postgres-relational/index';
import { runRelationalConformance } from '../conformance/relational.conformance';

// Guarded like the transformers/ollama adapters (F-005): runs only against a reachable Postgres.
// Bring one up with `docker compose up -d postgres`, then run with TESSERA_TEST_POSTGRES=1.
const CONNECTION_STRING =
  process.env['DATABASE_URL'] ?? 'postgres://tessera:tessera@127.0.0.1:5432/tessera';
const enabled = process.env['TESSERA_TEST_POSTGRES'] === '1';

describe.skipIf(!enabled)('postgres relational (TESSERA_TEST_POSTGRES=1)', () => {
  // The Postgres adapter must satisfy the shared RelationalStore contract.
  runRelationalConformance('postgres', async () => {
    const store = createPostgresStore({ connectionString: CONNECTION_STRING });
    return { store, cleanup: () => store.close() };
  });

  // Adapter-specific: prove Drizzle + node-postgres execute a real query round-trip.
  it('creates a table, inserts, and reads back via Drizzle', async () => {
    const store = createPostgresStore({ connectionString: CONNECTION_STRING });
    const table = `t_${Date.now().toString(36)}`;
    try {
      await store.db.execute(
        sql.raw(`CREATE TABLE ${table} (id serial PRIMARY KEY, v text NOT NULL)`),
      );
      await store.db.execute(sql.raw(`INSERT INTO ${table} (v) VALUES ('hello')`));
      const result = await store.db.execute(sql.raw(`SELECT v FROM ${table}`));
      const rows = result.rows as Array<{ v: string }>;
      expect(rows).toHaveLength(1);
      expect(rows[0]?.v).toBe('hello');
      await store.db.execute(sql.raw(`DROP TABLE ${table}`));
    } finally {
      await store.close();
    }
  });
});
