import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import type { RelationalStore } from '../../ports/relational.js';

export interface PostgresStoreOptions {
  /** Postgres connection string, e.g. `postgres://user:pass@host:5432/db`. */
  readonly connectionString: string;
  /** Optional folder of drizzle-kit migrations to apply on migrate() (added with schemas). */
  readonly migrationsFolder?: string;
  /** Max pool connections (default: node-postgres default of 10). */
  readonly maxConnections?: number;
}

/** Postgres {@link RelationalStore}: lifecycle plus a typed Drizzle `db` handle for repositories. */
export interface PostgresStore extends RelationalStore {
  readonly db: NodePgDatabase;
}

/**
 * Postgres RelationalStore adapter (self-hosted/cloud, ADR-0003/0005/0026) backed by node-postgres +
 * Drizzle — the same {@link RelationalStore} lifecycle the SQLite adapter implements, so it passes the
 * shared conformance suite. Use the Docker Compose `postgres` service (pgvector image) to run it locally.
 */
export function createPostgresStore(options: PostgresStoreOptions): PostgresStore {
  const pool = new pg.Pool({
    connectionString: options.connectionString,
    ...(options.maxConnections !== undefined ? { max: options.maxConnections } : {}),
  });
  const db = drizzle(pool);
  let open = true;

  return {
    db,

    async migrate() {
      // No schemas yet (they arrive with later features); applying a configured migrations folder is
      // forward-compatible and a no-op until one exists.
      if (options.migrationsFolder !== undefined) {
        await migrate(db, { migrationsFolder: options.migrationsFolder });
      }
    },

    async healthcheck() {
      if (!open) return false;
      try {
        await db.execute(sql`SELECT 1`);
        return true;
      } catch {
        return false;
      }
    },

    async close() {
      if (open) {
        open = false; // flip first so a concurrent healthcheck reports closed
        await pool.end();
      }
    },
  };
}
