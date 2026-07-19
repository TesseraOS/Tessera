import {
  DEFAULT_PROJECT_ID,
  DEFAULT_TENANT_ID,
  newId,
  type ProjectId,
  type TenantId,
} from '@tessera/core';
import type {
  RegisterSourceInput,
  SourceConfig,
  SourceId,
  SourceRecord,
  SourceRegistry,
} from '@tessera/ingestion';
import { defaultSourceLabel } from '@tessera/ingestion';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Persistent {@link SourceRegistry} over the storage `SqliteStore`'s Drizzle handle (F-038, ADR-0040) —
 * so registered sources **survive restarts** (the in-memory adapter in `@tessera/ingestion` does not).
 * Type-only import of the ingestion contract keeps the shape stable; every row carries a `tenant_id` +
 * `project_id` and {@link SourceRegistry.forTenant}/{@link SourceRegistry.forProject} scope reads/writes
 * to one `(tenant, project)` (FR-52/FR-66, ADR-0033/0037).
 */
const sources = sqliteTable('sources', {
  id: text('id').$type<SourceId>().primaryKey(),
  tenantId: text('tenant_id').$type<TenantId>().notNull(),
  projectId: text('project_id').$type<ProjectId>().notNull().default(DEFAULT_PROJECT_ID),
  kind: text('kind').notNull(),
  label: text('label').notNull(),
  config: text('config', { mode: 'json' }).$type<SourceConfig>().notNull(),
  createdAt: text('created_at').notNull(),
});

const CREATE_TABLE = sql`
  CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    project_id TEXT NOT NULL DEFAULT '${sql.raw(DEFAULT_PROJECT_ID)}',
    kind TEXT NOT NULL,
    label TEXT NOT NULL,
    config TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`;

/** Add the `project_id` column to a pre-existing `sources` table (idempotent additive migration). */
function ensureProjectColumn(db: BetterSQLite3Database): void {
  const columns = db.all<{ name: string }>(sql`PRAGMA table_info(sources)`);
  if (columns.length > 0 && !columns.some((column) => column.name === 'project_id')) {
    db.run(
      sql`ALTER TABLE sources ADD COLUMN project_id TEXT NOT NULL DEFAULT '${sql.raw(DEFAULT_PROJECT_ID)}'`,
    );
  }
}

type SourceRow = typeof sources.$inferSelect;

function toRecord(row: SourceRow): SourceRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    projectId: row.projectId,
    kind: row.kind,
    label: row.label,
    config: row.config,
    createdAt: row.createdAt,
  };
}

export function createSqliteSourceRegistry(db: BetterSQLite3Database): SourceRegistry {
  db.run(CREATE_TABLE);
  ensureProjectColumn(db);
  db.run(
    sql`CREATE INDEX IF NOT EXISTS idx_sources_tenant ON sources (tenant_id, project_id, created_at)`,
  );

  function registryFor(tenantId: TenantId, projectId: ProjectId): SourceRegistry {
    const inScope = and(eq(sources.tenantId, tenantId), eq(sources.projectId, projectId));
    return {
      list() {
        const rows = db
          .select()
          .from(sources)
          .where(inScope)
          .orderBy(asc(sources.createdAt), asc(sources.id))
          .all();
        return Promise.resolve(rows.map(toRecord));
      },

      register(input: RegisterSourceInput) {
        const record: SourceRecord = {
          id: newId<'Source'>(),
          tenantId, // stamp the bound tenant regardless of any caller intent
          projectId, // and the bound project
          kind: input.kind,
          label: input.label ?? defaultSourceLabel(input),
          config: { ...input.config },
          createdAt: new Date().toISOString(),
        };
        db.insert(sources)
          .values({
            id: record.id,
            tenantId,
            projectId,
            kind: record.kind,
            label: record.label,
            config: record.config,
            createdAt: record.createdAt,
          })
          .run();
        return Promise.resolve(record);
      },

      get(id: SourceId) {
        const row = db
          .select()
          .from(sources)
          .where(and(inScope, eq(sources.id, id)))
          .get();
        return Promise.resolve(row === undefined ? undefined : toRecord(row));
      },

      remove(id: SourceId) {
        db.delete(sources)
          .where(and(inScope, eq(sources.id, id)))
          .run();
        return Promise.resolve();
      },

      forTenant(next: TenantId) {
        return registryFor(next, DEFAULT_PROJECT_ID);
      },

      forProject(next: ProjectId) {
        return registryFor(tenantId, next);
      },
    };
  }

  return registryFor(DEFAULT_TENANT_ID, DEFAULT_PROJECT_ID);
}
