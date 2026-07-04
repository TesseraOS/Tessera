import { DEFAULT_TENANT_ID, newId, type TenantId } from '@tessera/core';
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
 * Type-only import of the ingestion contract keeps the shape stable; every row carries a `tenant_id` and
 * {@link SourceRegistry.forTenant} scopes reads/writes to one tenant (FR-52, ADR-0033).
 */
const sources = sqliteTable('sources', {
  id: text('id').$type<SourceId>().primaryKey(),
  tenantId: text('tenant_id').$type<TenantId>().notNull(),
  kind: text('kind').notNull(),
  label: text('label').notNull(),
  config: text('config', { mode: 'json' }).$type<SourceConfig>().notNull(),
  createdAt: text('created_at').notNull(),
});

const CREATE_TABLE = sql`
  CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    label TEXT NOT NULL,
    config TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`;

type SourceRow = typeof sources.$inferSelect;

function toRecord(row: SourceRow): SourceRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    kind: row.kind,
    label: row.label,
    config: row.config,
    createdAt: row.createdAt,
  };
}

export function createSqliteSourceRegistry(db: BetterSQLite3Database): SourceRegistry {
  db.run(CREATE_TABLE);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_sources_tenant ON sources (tenant_id, created_at)`);

  function registryFor(tenantId: TenantId): SourceRegistry {
    const inTenant = eq(sources.tenantId, tenantId);
    return {
      list() {
        const rows = db
          .select()
          .from(sources)
          .where(inTenant)
          .orderBy(asc(sources.createdAt), asc(sources.id))
          .all();
        return Promise.resolve(rows.map(toRecord));
      },

      register(input: RegisterSourceInput) {
        const record: SourceRecord = {
          id: newId<'Source'>(),
          tenantId, // stamp the bound tenant regardless of any caller intent
          kind: input.kind,
          label: input.label ?? defaultSourceLabel(input),
          config: { ...input.config },
          createdAt: new Date().toISOString(),
        };
        db.insert(sources)
          .values({
            id: record.id,
            tenantId,
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
          .where(and(inTenant, eq(sources.id, id)))
          .get();
        return Promise.resolve(row === undefined ? undefined : toRecord(row));
      },

      remove(id: SourceId) {
        db.delete(sources)
          .where(and(inTenant, eq(sources.id, id)))
          .run();
        return Promise.resolve();
      },

      forTenant(next: TenantId) {
        return registryFor(next);
      },
    };
  }

  return registryFor(DEFAULT_TENANT_ID);
}
