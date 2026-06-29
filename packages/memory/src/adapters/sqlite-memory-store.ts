import { and, asc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { Memory, MemoryId, MemoryKind, MemoryLineageId, MemoryMetadata } from '../domain.js';
import type { MemoryListFilter, MemoryStore } from '../ports/memory-store.js';

/** Drizzle schema for the `memories` table (ADR-0005). One row per memory version. */
const memories = sqliteTable('memories', {
  id: text('id').$type<MemoryId>().primaryKey(),
  lineageId: text('lineage_id').$type<MemoryLineageId>().notNull(),
  kind: text('kind').$type<MemoryKind>().notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  scope: text('scope').notNull(),
  confidence: real('confidence').notNull(),
  metadata: text('metadata', { mode: 'json' }).$type<MemoryMetadata>().notNull(),
  version: integer('version').notNull(),
  supersedes: text('supersedes').$type<MemoryId>(),
  supersededBy: text('superseded_by').$type<MemoryId>(),
  createdAt: text('created_at').notNull(),
});

const CREATE_TABLE = sql`
  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    lineage_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    scope TEXT NOT NULL,
    confidence REAL NOT NULL,
    metadata TEXT NOT NULL,
    version INTEGER NOT NULL,
    supersedes TEXT,
    superseded_by TEXT,
    created_at TEXT NOT NULL
  )
`;

type MemoryRow = typeof memories.$inferSelect;

function toMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    lineageId: row.lineageId,
    kind: row.kind,
    title: row.title,
    body: row.body,
    scope: row.scope,
    confidence: row.confidence,
    metadata: row.metadata,
    version: row.version,
    supersedes: row.supersedes,
    supersededBy: row.supersededBy,
    createdAt: row.createdAt,
  };
}

/**
 * SQLite {@link MemoryStore} (the local default, ADR-0003/0005) over the storage `SqliteStore`'s
 * Drizzle handle. Creates the `memories` table on construction if absent (drizzle-kit migration
 * tooling is a later feature, F-024). `supersede` runs in a transaction so a lineage never has two
 * current versions.
 */
export function createSqliteMemoryStore(db: BetterSQLite3Database): MemoryStore {
  db.run(CREATE_TABLE);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_memories_lineage ON memories (lineage_id)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_memories_current ON memories (superseded_by)`);

  return {
    add(memory) {
      db.insert(memories).values(memory).run();
      return Promise.resolve();
    },

    supersede(previousId, next) {
      db.transaction((tx) => {
        tx.update(memories).set({ supersededBy: next.id }).where(eq(memories.id, previousId)).run();
        tx.insert(memories).values(next).run();
      });
      return Promise.resolve();
    },

    getById(id: MemoryId) {
      const row = db.select().from(memories).where(eq(memories.id, id)).get();
      return Promise.resolve(row === undefined ? undefined : toMemory(row));
    },

    getCurrent(lineageId: MemoryLineageId) {
      const row = db
        .select()
        .from(memories)
        .where(and(eq(memories.lineageId, lineageId), isNull(memories.supersededBy)))
        .get();
      return Promise.resolve(row === undefined ? undefined : toMemory(row));
    },

    listVersions(lineageId: MemoryLineageId) {
      const rows = db
        .select()
        .from(memories)
        .where(eq(memories.lineageId, lineageId))
        .orderBy(asc(memories.version))
        .all();
      return Promise.resolve(rows.map(toMemory));
    },

    listCurrent(filter?: MemoryListFilter) {
      const conditions: SQL[] = [isNull(memories.supersededBy)];
      if (filter?.kind !== undefined) conditions.push(eq(memories.kind, filter.kind));
      if (filter?.scope !== undefined) conditions.push(eq(memories.scope, filter.scope));
      const rows = db
        .select()
        .from(memories)
        .where(and(...conditions))
        .orderBy(asc(memories.createdAt), asc(memories.id))
        .all();
      return Promise.resolve(rows.map(toMemory));
    },
  };
}
