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

/**
 * The slice of a `pg` client this module needs. Structural on purpose: the runner stays free of a
 * direct `pg` import, and any `pg.Client` / `pg.PoolClient` satisfies it.
 */
export interface PgQueryable {
  query(text: string): Promise<{ rows: Array<Record<string, unknown>> }>;
}

/**
 * {@link MigrationDb} over **one** Postgres client rather than a pool (F-056, ADR-0059 §2).
 *
 * Required because `pg_advisory_lock` is **session-scoped**: a pooled `db.execute` may take the lock
 * on one connection and run the migrations on another, which holds a lock that guards nothing. The
 * caller obtains a single client (see `withPgAdvisoryLock`), locks it, and migrates through it.
 */
export function pgClientMigrationDb(client: PgQueryable): MigrationDb {
  return {
    async run(statement) {
      await client.query(statement);
    },
    async rows(query) {
      return (await client.query(query)).rows;
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
 *
 * **Concurrency (F-056/ADR-0059).** This reads the applied ids and *then* applies, so two processes
 * starting together both see an empty table and both apply. Idempotence by id makes the end state
 * survivable, but concurrent DDL on the same table is not something to rely on. A multi-replica
 * caller must serialize the whole call — on Postgres, via {@link withPgAdvisoryLock} plus
 * {@link pgClientMigrationDb} so the lock and the migrations share one session. Single-process
 * callers (the Local profile) need nothing.
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
