import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createPostgresStore } from '../../src/adapters/postgres-relational/index';
import { createSqliteStore } from '../../src/adapters/sqlite-relational/index';
import {
  postgresMigrationDb,
  runMigrations,
  sqliteMigrationDb,
  type Migration,
} from '../../src/migrations/runner';

const MIGRATIONS: readonly Migration[] = [
  { id: '0001_widgets', up: 'CREATE TABLE widgets (id integer primary key, name text not null)' },
  {
    id: '0002_seed',
    up: ["INSERT INTO widgets (name) VALUES ('a')", "INSERT INTO widgets (name) VALUES ('b')"],
  },
];

describe('runMigrations (sqlite)', () => {
  it('applies pending migrations, then skips already-applied (idempotent)', async () => {
    const store = createSqliteStore({ path: ':memory:' });
    const db = sqliteMigrationDb(store.db);
    try {
      const first = await runMigrations(db, MIGRATIONS);
      expect(first.applied).toEqual(['0001_widgets', '0002_seed']);
      expect(first.skipped).toEqual([]);
      expect(store.db.all<{ n: number }>(sql`SELECT count(*) AS n FROM widgets`)[0]?.n).toBe(2);

      const second = await runMigrations(db, MIGRATIONS);
      expect(second.applied).toEqual([]);
      expect(second.skipped).toEqual(['0001_widgets', '0002_seed']);
      // Idempotent: the seed did not run again.
      expect(store.db.all<{ n: number }>(sql`SELECT count(*) AS n FROM widgets`)[0]?.n).toBe(2);
    } finally {
      await store.close();
    }
  });

  it('applies only the newly-added migration on a later run', async () => {
    const store = createSqliteStore({ path: ':memory:' });
    const db = sqliteMigrationDb(store.db);
    try {
      await runMigrations(db, MIGRATIONS.slice(0, 1));
      const next = await runMigrations(db, MIGRATIONS);
      expect(next.applied).toEqual(['0002_seed']);
      expect(next.skipped).toEqual(['0001_widgets']);
    } finally {
      await store.close();
    }
  });

  it('rejects an unsafe migration id', async () => {
    const store = createSqliteStore({ path: ':memory:' });
    try {
      await expect(
        runMigrations(sqliteMigrationDb(store.db), [
          { id: "x'; DROP TABLE y; --", up: 'SELECT 1' },
        ]),
      ).rejects.toThrow(/invalid migration id/i);
    } finally {
      await store.close();
    }
  });
});

// Parity: the same runner works on Postgres (guarded; F-005 pattern).
const CONNECTION_STRING =
  process.env['DATABASE_URL'] ?? 'postgres://tessera:tessera@127.0.0.1:5432/tessera';
const pgEnabled = process.env['TESSERA_TEST_POSTGRES'] === '1';

describe.skipIf(!pgEnabled)('runMigrations (postgres, TESSERA_TEST_POSTGRES=1)', () => {
  it('applies then is idempotent on Postgres', async () => {
    const store = createPostgresStore({ connectionString: CONNECTION_STRING });
    const db = postgresMigrationDb(store.db);
    const table = `widgets_${Date.now().toString(36)}`;
    const migrations: readonly Migration[] = [
      {
        id: `${table}_create`,
        up: `CREATE TABLE ${table} (id serial primary key, name text not null)`,
      },
      { id: `${table}_seed`, up: `INSERT INTO ${table} (name) VALUES ('a')` },
    ];
    try {
      expect((await runMigrations(db, migrations)).applied).toHaveLength(2);
      const second = await runMigrations(db, migrations);
      expect(second.applied).toEqual([]);
      expect(second.skipped).toHaveLength(2);
      const rows = (await store.db.execute(sql.raw(`SELECT count(*)::int AS n FROM ${table}`)))
        .rows as Array<{ n: number }>;
      expect(rows[0]?.n).toBe(1);
      await store.db.execute(sql.raw(`DROP TABLE ${table}`));
    } finally {
      await store.close();
    }
  });
});
