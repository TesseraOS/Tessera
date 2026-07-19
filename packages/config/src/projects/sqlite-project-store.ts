import { type ProjectId, type TenantId } from '@tessera/core';
import type { Project, ProjectStore } from '@tessera/api/projects';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Persistent {@link ProjectStore} over the storage `SqliteStore`'s Drizzle handle (F-066, ADR-0037) — so
 * projects **survive restarts** (the in-memory reference adapter in `@tessera/api` does not). Holds only
 * the stored (non-default) projects; the reserved default project is synthesized by the service and never
 * persisted. Type-only import of the `@tessera/api` contract keeps the shape stable; every row carries a
 * `tenant_id` and each method is scoped by the explicit `tenantId` argument, so a project is only ever
 * visible/mutable within its tenant.
 */
const projects = sqliteTable('projects', {
  id: text('id').$type<ProjectId>().primaryKey(),
  tenantId: text('tenant_id').$type<TenantId>().notNull(),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
});

const CREATE_TABLE = sql`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`;

type ProjectRow = typeof projects.$inferSelect;

/** A stored row is always a non-default project (the default is synthesized, never persisted). */
function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    createdAt: row.createdAt,
    isDefault: false,
  };
}

export function createSqliteProjectStore(db: BetterSQLite3Database): ProjectStore {
  db.run(CREATE_TABLE);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects (tenant_id, created_at)`);

  return {
    create(project: Project) {
      db.insert(projects)
        .values({
          id: project.id,
          tenantId: project.tenantId,
          name: project.name,
          createdAt: project.createdAt,
        })
        .run();
      return Promise.resolve();
    },

    get(tenantId: TenantId, id: ProjectId) {
      const row = db
        .select()
        .from(projects)
        .where(and(eq(projects.tenantId, tenantId), eq(projects.id, id)))
        .get();
      return Promise.resolve(row === undefined ? undefined : toProject(row));
    },

    list(tenantId: TenantId) {
      const rows = db
        .select()
        .from(projects)
        .where(eq(projects.tenantId, tenantId))
        .orderBy(asc(projects.createdAt), asc(projects.id))
        .all();
      return Promise.resolve(rows.map(toProject));
    },

    rename(tenantId: TenantId, id: ProjectId, name: string) {
      const scope = and(eq(projects.tenantId, tenantId), eq(projects.id, id));
      const updated = db.update(projects).set({ name }).where(scope).returning().get();
      return Promise.resolve(updated === undefined ? undefined : toProject(updated));
    },

    remove(tenantId: TenantId, id: ProjectId) {
      db.delete(projects)
        .where(and(eq(projects.tenantId, tenantId), eq(projects.id, id)))
        .run();
      return Promise.resolve();
    },
  };
}
