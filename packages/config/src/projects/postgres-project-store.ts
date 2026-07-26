import { type ProjectId, type TenantId } from '@tessera/core';
import type { Project, ProjectStore } from '@tessera/api/projects';
import { and, asc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { pgTable, text } from 'drizzle-orm/pg-core';

/** Drizzle schema for the Postgres `projects` table — the same columns the SQLite adapter defines. */
const projects = pgTable('projects', {
  id: text('id').$type<ProjectId>().primaryKey(),
  tenantId: text('tenant_id').$type<TenantId>().notNull(),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
});

/** Schema for the Postgres {@link ProjectStore} (F-056, ADR-0059 §2). */
export const pgProjectStoreMigrations: readonly { id: string; up: readonly string[] }[] = [
  {
    id: 'f056-projects-001',
    up: [
      `CREATE TABLE IF NOT EXISTS projects (
        id text PRIMARY KEY,
        tenant_id text NOT NULL,
        name text NOT NULL,
        created_at text NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects (tenant_id, created_at)`,
    ],
  },
];

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

/**
 * Postgres {@link ProjectStore} (F-066, ADR-0037). Holds only the stored (non-default) projects; the
 * reserved default project is synthesized by the service and never persisted. Every row carries a
 * `tenant_id` and each method is scoped by its explicit `tenantId` argument, so a project is only ever
 * visible or mutable within its own tenant.
 *
 * **Tables must already exist** ({@link pgProjectStoreMigrations}).
 */
export function createPostgresProjectStore(db: NodePgDatabase): ProjectStore {
  return {
    async create(project: Project) {
      await db.insert(projects).values({
        id: project.id,
        tenantId: project.tenantId,
        name: project.name,
        createdAt: project.createdAt,
      });
    },

    async get(tenantId: TenantId, id: ProjectId) {
      const rows = await db
        .select()
        .from(projects)
        .where(and(eq(projects.tenantId, tenantId), eq(projects.id, id)))
        .limit(1);
      const row = rows[0];
      return row === undefined ? undefined : toProject(row);
    },

    async list(tenantId: TenantId) {
      const rows = await db
        .select()
        .from(projects)
        .where(eq(projects.tenantId, tenantId))
        .orderBy(asc(projects.createdAt), asc(projects.id));
      return rows.map(toProject);
    },

    async rename(tenantId: TenantId, id: ProjectId, name: string) {
      const updated = await db
        .update(projects)
        .set({ name })
        .where(and(eq(projects.tenantId, tenantId), eq(projects.id, id)))
        .returning();
      const row = updated[0];
      return row === undefined ? undefined : toProject(row);
    },

    async remove(tenantId: TenantId, id: ProjectId) {
      await db.delete(projects).where(and(eq(projects.tenantId, tenantId), eq(projects.id, id)));
    },
  };
}
