import { and, asc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import {
  DEFAULT_PROJECT_ID,
  DEFAULT_TENANT_ID,
  type ProjectId,
  type TenantId,
} from '@tessera/core';
import type { Memory, MemoryId, MemoryKind, MemoryLineageId, MemoryMetadata } from '../domain.js';
import type { MemoryListFilter, MemoryStore } from '../ports/memory-store.js';

/** Drizzle schema for the `memories` table (ADR-0005). One row per memory version. */
const memories = sqliteTable('memories', {
  id: text('id').$type<MemoryId>().primaryKey(),
  // Tenant scope (FR-52, ADR-0033). Defaults to the single Local-profile tenant for back-compat.
  tenantId: text('tenant_id').$type<TenantId>().notNull().default(DEFAULT_TENANT_ID),
  // Project scope within the tenant (FR-66, ADR-0037). Defaults to the reserved default project.
  projectId: text('project_id').$type<ProjectId>().notNull().default(DEFAULT_PROJECT_ID),
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
    tenant_id TEXT NOT NULL DEFAULT '${sql.raw(DEFAULT_TENANT_ID)}',
    project_id TEXT NOT NULL DEFAULT '${sql.raw(DEFAULT_PROJECT_ID)}',
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

/** Project a row to the tenant-agnostic {@link Memory} domain shape (tenant is a storage concern). */
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
 * Add the `tenant_id` / `project_id` scope columns to a pre-existing `memories` table (idempotent
 * additive migration; existing rows fall into the default tenant + default project — ADR-0033/0037).
 */
function ensureScopeColumns(db: BetterSQLite3Database): void {
  const columns = db.all<{ name: string }>(sql`PRAGMA table_info(memories)`);
  const has = (name: string): boolean => columns.some((column) => column.name === name);
  if (!has('tenant_id')) {
    db.run(
      sql`ALTER TABLE memories ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '${sql.raw(DEFAULT_TENANT_ID)}'`,
    );
  }
  if (!has('project_id')) {
    db.run(
      sql`ALTER TABLE memories ADD COLUMN project_id TEXT NOT NULL DEFAULT '${sql.raw(DEFAULT_PROJECT_ID)}'`,
    );
  }
}

/**
 * SQLite {@link MemoryStore} (the local default, ADR-0003/0005) over the storage `SqliteStore`'s
 * Drizzle handle. Creates the `memories` table on construction if absent (drizzle-kit migration
 * tooling is a later feature, F-024). `supersede` runs in a transaction so a lineage never has two
 * current versions.
 *
 * **Scope (FR-52/FR-66, ADR-0033/0037):** every row carries a `tenant_id` + `project_id`; the store the
 * factory returns is bound to `(DEFAULT_TENANT_ID, DEFAULT_PROJECT_ID)` and
 * {@link MemoryStore.forTenant}/{@link MemoryStore.forProject} rebind them. All reads filter by the bound
 * scope and all writes stamp it, so memories never cross tenants or projects.
 */
export function createSqliteMemoryStore(db: BetterSQLite3Database): MemoryStore {
  db.run(CREATE_TABLE);
  ensureScopeColumns(db);
  db.run(
    sql`CREATE INDEX IF NOT EXISTS idx_memories_lineage ON memories (tenant_id, project_id, lineage_id)`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS idx_memories_current ON memories (tenant_id, project_id, superseded_by)`,
  );

  function storeFor(tenantId: TenantId, projectId: ProjectId): MemoryStore {
    const inScope = and(eq(memories.tenantId, tenantId), eq(memories.projectId, projectId));
    return {
      add(memory) {
        db.insert(memories)
          .values({ ...memory, tenantId, projectId })
          .run();
        return Promise.resolve();
      },

      supersede(previousId, next) {
        db.transaction((tx) => {
          tx.update(memories)
            .set({ supersededBy: next.id })
            .where(and(eq(memories.id, previousId), inScope))
            .run();
          tx.insert(memories)
            .values({ ...next, tenantId, projectId })
            .run();
        });
        return Promise.resolve();
      },

      getById(id: MemoryId) {
        const row = db
          .select()
          .from(memories)
          .where(and(eq(memories.id, id), inScope))
          .get();
        return Promise.resolve(row === undefined ? undefined : toMemory(row));
      },

      getCurrent(lineageId: MemoryLineageId) {
        const row = db
          .select()
          .from(memories)
          .where(and(eq(memories.lineageId, lineageId), isNull(memories.supersededBy), inScope))
          .get();
        return Promise.resolve(row === undefined ? undefined : toMemory(row));
      },

      listVersions(lineageId: MemoryLineageId) {
        const rows = db
          .select()
          .from(memories)
          .where(and(eq(memories.lineageId, lineageId), inScope))
          .orderBy(asc(memories.version))
          .all();
        return Promise.resolve(rows.map(toMemory));
      },

      listCurrent(filter?: MemoryListFilter) {
        const conditions: (SQL | undefined)[] = [isNull(memories.supersededBy), inScope];
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

      countCurrent(filter?: MemoryListFilter) {
        const conditions: (SQL | undefined)[] = [isNull(memories.supersededBy), inScope];
        if (filter?.kind !== undefined) conditions.push(eq(memories.kind, filter.kind));
        if (filter?.scope !== undefined) conditions.push(eq(memories.scope, filter.scope));
        const row = db
          .select({ value: sql<number>`count(*)` })
          .from(memories)
          .where(and(...conditions))
          .get();
        return Promise.resolve(row?.value ?? 0);
      },

      exportAll() {
        const rows = db
          .select()
          .from(memories)
          .where(inScope)
          .orderBy(asc(memories.createdAt), asc(memories.id))
          .all();
        return Promise.resolve(rows.map(toMemory));
      },

      deleteVersion(id: MemoryId) {
        db.delete(memories)
          .where(and(eq(memories.id, id), inScope))
          .run();
        return Promise.resolve();
      },

      deleteLineage(lineageId: MemoryLineageId) {
        db.delete(memories)
          .where(and(eq(memories.lineageId, lineageId), inScope))
          .run();
        return Promise.resolve();
      },

      forTenant(next) {
        return storeFor(next, DEFAULT_PROJECT_ID);
      },

      forProject(next) {
        return storeFor(tenantId, next);
      },
    };
  }

  return storeFor(DEFAULT_TENANT_ID, DEFAULT_PROJECT_ID);
}
