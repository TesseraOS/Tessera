import type { IngestionManifest, SourceId } from '@tessera/ingestion';
import { and, eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Persistent {@link IngestionManifest} over the storage Drizzle handle (F-038) — the content-hash index
 * per `(source, path)` that makes scans incremental + idempotent (FR-8), durable across restarts (the
 * in-memory adapter in `@tessera/ingestion` is not). Keyed by the globally-unique `source_id`, so no
 * tenant column is needed — a tenant can only reference its own sources (the registry gates that).
 */
// The composite primary key is enforced by the CREATE TABLE DDL below; the Drizzle table object is only
// used to build queries, so it needs the columns, not a schema-level PK declaration.
const manifest = sqliteTable('ingestion_manifest', {
  sourceId: text('source_id').$type<SourceId>().notNull(),
  path: text('path').notNull(),
  contentHash: text('content_hash').notNull(),
});

const CREATE_TABLE = sql`
  CREATE TABLE IF NOT EXISTS ingestion_manifest (
    source_id TEXT NOT NULL,
    path TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    PRIMARY KEY (source_id, path)
  )
`;

export function createSqliteManifest(db: BetterSQLite3Database): IngestionManifest {
  db.run(CREATE_TABLE);

  return {
    snapshot(sourceId) {
      const rows = db
        .select({ path: manifest.path, contentHash: manifest.contentHash })
        .from(manifest)
        .where(eq(manifest.sourceId, sourceId))
        .all();
      const map = new Map<string, string>();
      for (const row of rows) map.set(row.path, row.contentHash);
      return Promise.resolve(map);
    },

    get(sourceId, path) {
      const row = db
        .select({ contentHash: manifest.contentHash })
        .from(manifest)
        .where(and(eq(manifest.sourceId, sourceId), eq(manifest.path, path)))
        .get();
      return Promise.resolve(row?.contentHash);
    },

    set(sourceId, path, contentHash) {
      db.insert(manifest)
        .values({ sourceId, path, contentHash })
        .onConflictDoUpdate({ target: [manifest.sourceId, manifest.path], set: { contentHash } })
        .run();
      return Promise.resolve();
    },

    delete(sourceId, path) {
      db.delete(manifest)
        .where(and(eq(manifest.sourceId, sourceId), eq(manifest.path, path)))
        .run();
      return Promise.resolve();
    },
  };
}
