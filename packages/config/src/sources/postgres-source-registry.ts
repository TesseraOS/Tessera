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
import { and, asc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { jsonb, pgTable, text } from 'drizzle-orm/pg-core';

/**
 * Drizzle schema for the Postgres `sources` table — the same columns the SQLite adapter defines.
 *
 * `jsonb` for `config` where SQLite stores JSON text: Drizzle hands back a parsed object either way,
 * so `SourceConfig` is identical on both sides.
 */
const sources = pgTable('sources', {
  id: text('id').$type<SourceId>().primaryKey(),
  tenantId: text('tenant_id').$type<TenantId>().notNull(),
  projectId: text('project_id').$type<ProjectId>().notNull().default(DEFAULT_PROJECT_ID),
  kind: text('kind').notNull(),
  label: text('label').notNull(),
  config: jsonb('config').$type<SourceConfig>().notNull(),
  createdAt: text('created_at').notNull(),
});

/** Schema for the Postgres {@link SourceRegistry} (F-056, ADR-0059 §2). */
export const pgSourceRegistryMigrations: readonly { id: string; up: readonly string[] }[] = [
  {
    id: 'f056-sources-001',
    up: [
      `CREATE TABLE IF NOT EXISTS sources (
        id text PRIMARY KEY,
        tenant_id text NOT NULL,
        project_id text NOT NULL DEFAULT '${DEFAULT_PROJECT_ID}',
        kind text NOT NULL,
        label text NOT NULL,
        config jsonb NOT NULL,
        created_at text NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_sources_tenant
         ON sources (tenant_id, project_id, created_at)`,
    ],
  },
];

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

/**
 * Postgres {@link SourceRegistry} (F-038, ADR-0040) — registered sources survive restarts and are
 * visible to every replica. Every row carries `tenant_id` + `project_id`, and
 * `forTenant`/`forProject` confine reads and writes to one `(tenant, project)` (FR-52/FR-66,
 * ADR-0033/0037).
 *
 * **Tables must already exist** ({@link pgSourceRegistryMigrations}).
 */
export function createPostgresSourceRegistry(db: NodePgDatabase): SourceRegistry {
  function registryFor(tenantId: TenantId, projectId: ProjectId): SourceRegistry {
    const inScope = and(eq(sources.tenantId, tenantId), eq(sources.projectId, projectId));
    return {
      async list() {
        const rows = await db
          .select()
          .from(sources)
          .where(inScope)
          .orderBy(asc(sources.createdAt), asc(sources.id));
        return rows.map(toRecord);
      },

      async register(input: RegisterSourceInput) {
        const record: SourceRecord = {
          id: newId<'Source'>(),
          tenantId, // stamp the bound tenant regardless of any caller intent
          projectId, // and the bound project
          kind: input.kind,
          label: input.label ?? defaultSourceLabel(input),
          config: { ...input.config },
          createdAt: new Date().toISOString(),
        };
        await db.insert(sources).values({
          id: record.id,
          tenantId,
          projectId,
          kind: record.kind,
          label: record.label,
          config: record.config,
          createdAt: record.createdAt,
        });
        return record;
      },

      async get(id: SourceId) {
        const rows = await db
          .select()
          .from(sources)
          .where(and(inScope, eq(sources.id, id)))
          .limit(1);
        const row = rows[0];
        return row === undefined ? undefined : toRecord(row);
      },

      async remove(id: SourceId) {
        await db.delete(sources).where(and(inScope, eq(sources.id, id)));
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
