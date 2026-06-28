import Database from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { RelationalStore } from '../../ports/relational.js';

export interface SqliteStoreOptions {
  /** File path, or ':memory:' for an ephemeral database. */
  readonly path: string;
  /** Optional folder of drizzle-kit migrations to apply on migrate() (added with schemas). */
  readonly migrationsFolder?: string;
}

/** SQLite {@link RelationalStore}: lifecycle plus a typed Drizzle `db` handle for repositories. */
export interface SqliteStore extends RelationalStore {
  readonly db: BetterSQLite3Database;
}

/**
 * SQLite RelationalStore adapter (the local default, ADR-0003/0005) backed by better-sqlite3 +
 * Drizzle. A Postgres adapter implements the same lifecycle for cloud.
 */
export function createSqliteStore(options: SqliteStoreOptions): SqliteStore {
  const sqlite = new Database(options.path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite);
  let open = true;

  return {
    db,

    async migrate() {
      // No schemas yet (they arrive with later features); applying a configured migrations
      // folder is forward-compatible and a no-op until one exists.
      if (options.migrationsFolder !== undefined) {
        migrate(db, { migrationsFolder: options.migrationsFolder });
      }
    },

    async healthcheck() {
      if (!open) return false;
      try {
        db.run(sql`SELECT 1`);
        return true;
      } catch {
        return false;
      }
    },

    async close() {
      if (open) {
        sqlite.close();
        open = false;
      }
    },
  };
}
