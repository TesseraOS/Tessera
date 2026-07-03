import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { ValidationError } from '@tessera/core';

/** Table tracking which migrations have been applied. */
const MIGRATIONS_TABLE = '_tessera_migrations';
/** Migration ids are developer-controlled but constrained (they are interpolated into SQL). */
const ID_PATTERN = /^[A-Za-z0-9_.-]+$/;

/** One migration: a stable id and the forward SQL to apply (one or more statements). */
export interface Migration {
  readonly id: string;
  readonly up: string | readonly string[];
}

export interface MigrationResult {
  readonly applied: readonly string[];
  readonly skipped: readonly string[];
}

/** A minimal, backend-agnostic executor the runner uses (SQLite or Postgres). */
export interface MigrationDb {
  /** Execute a statement that returns no rows (DDL/DML). */
  run(statement: string): Promise<void>;
  /** Execute a query and return its rows. */
  rows(query: string): Promise<ReadonlyArray<Record<string, unknown>>>;
}

/** {@link MigrationDb} over a SQLite Drizzle handle. */
export function sqliteMigrationDb(db: BetterSQLite3Database): MigrationDb {
  return {
    run(statement) {
      db.run(sql.raw(statement));
      return Promise.resolve();
    },
    rows(query) {
      return Promise.resolve(db.all(sql.raw(query)) as Array<Record<string, unknown>>);
    },
  };
}

/** {@link MigrationDb} over a Postgres (node-postgres) Drizzle handle. */
export function postgresMigrationDb(db: NodePgDatabase): MigrationDb {
  return {
    async run(statement) {
      await db.execute(sql.raw(statement));
    },
    async rows(query) {
      const result = await db.execute(sql.raw(query));
      return result.rows as Array<Record<string, unknown>>;
    },
  };
}

/** Quote a SQL string literal (ids are constrained, but escape defensively). */
function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Apply pending migrations in order, **idempotently** (FR-56): each applied id is recorded in the
 * `_tessera_migrations` table and ids already present are skipped, so re-running is a no-op. Migration
 * `up` SQL is caller-supplied (portable DDL/DML); ids are constrained to a safe identifier pattern. Works
 * on SQLite and Postgres via the {@link MigrationDb} seam. Migrations are applied individually (not one
 * big transaction) — write each so it is safe to re-run after a partial failure.
 */
export async function runMigrations(
  db: MigrationDb,
  migrations: readonly Migration[],
): Promise<MigrationResult> {
  await db.run(
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (id text PRIMARY KEY, applied_at text NOT NULL)`,
  );
  const appliedRows = await db.rows(`SELECT id FROM ${MIGRATIONS_TABLE}`);
  const already = new Set(appliedRows.map((row) => String(row['id'])));

  const applied: string[] = [];
  const skipped: string[] = [];
  for (const migration of migrations) {
    if (!ID_PATTERN.test(migration.id)) {
      throw new ValidationError('invalid migration id', { details: { id: migration.id } });
    }
    if (already.has(migration.id)) {
      skipped.push(migration.id);
      continue;
    }
    const statements = typeof migration.up === 'string' ? [migration.up] : migration.up;
    for (const statement of statements) {
      await db.run(statement);
    }
    await db.run(
      `INSERT INTO ${MIGRATIONS_TABLE} (id, applied_at) VALUES (${quote(migration.id)}, ${quote(new Date().toISOString())})`,
    );
    applied.push(migration.id);
  }
  return { applied, skipped };
}
