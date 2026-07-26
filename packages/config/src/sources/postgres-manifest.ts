import type { IngestionManifest, SourceId } from '@tessera/ingestion';
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { pgTable, text } from 'drizzle-orm/pg-core';

/**
 * Drizzle schema for the Postgres `ingestion_manifest` table — the same columns the SQLite adapter
 * defines, so one manifest shape serves both.
 *
 * No tenant column, matching SQLite: the key is the globally-unique `source_id`, and a tenant can
 * only reference its own sources because the registry gates that. Adding a tenant column here would
 * imply the manifest is a scoping boundary, which it is not.
 */
const manifest = pgTable('ingestion_manifest', {
  sourceId: text('source_id').$type<SourceId>().notNull(),
  path: text('path').notNull(),
  contentHash: text('content_hash').notNull(),
});

/**
 * Schema for the Postgres {@link IngestionManifest} (F-056, ADR-0059 §2).
 *
 * The adapter does **not** create this itself — unlike the SQLite adapter, which self-provisions on
 * construction. On Postgres the composition root applies every package's migrations once under an
 * advisory lock, because concurrent replicas racing `CREATE TABLE` is a real failure mode.
 */
export const pgManifestMigrations: readonly { id: string; up: readonly string[] }[] = [
  {
    id: 'f056-ingestion-manifest-001',
    up: [
      `CREATE TABLE IF NOT EXISTS ingestion_manifest (
        source_id text NOT NULL,
        path text NOT NULL,
        content_hash text NOT NULL,
        PRIMARY KEY (source_id, path)
      )`,
    ],
  },
];

/**
 * Postgres {@link IngestionManifest} — the content-hash index per `(source, path)` that makes scans
 * incremental and idempotent (FR-8), durable across restarts and shared across replicas.
 *
 * **Tables must already exist** ({@link pgManifestMigrations}).
 */
export function createPostgresManifest(db: NodePgDatabase): IngestionManifest {
  return {
    async snapshot(sourceId) {
      const rows = await db
        .select({ path: manifest.path, contentHash: manifest.contentHash })
        .from(manifest)
        .where(eq(manifest.sourceId, sourceId));
      return new Map(rows.map((row) => [row.path, row.contentHash]));
    },

    async get(sourceId, path) {
      const rows = await db
        .select({ contentHash: manifest.contentHash })
        .from(manifest)
        .where(and(eq(manifest.sourceId, sourceId), eq(manifest.path, path)))
        .limit(1);
      return rows[0]?.contentHash;
    },

    async set(sourceId, path, contentHash) {
      await db
        .insert(manifest)
        .values({ sourceId, path, contentHash })
        .onConflictDoUpdate({ target: [manifest.sourceId, manifest.path], set: { contentHash } });
    },

    async delete(sourceId, path) {
      await db
        .delete(manifest)
        .where(and(eq(manifest.sourceId, sourceId), eq(manifest.path, path)));
    },
  };
}
