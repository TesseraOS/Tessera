import { and, asc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { doublePrecision, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import {
  DEFAULT_PROJECT_ID,
  DEFAULT_TENANT_ID,
  type ProjectId,
  type TenantId,
} from '@tessera/core';
import type { Memory, MemoryId, MemoryKind, MemoryLineageId, MemoryMetadata } from '../domain.js';
import type { MemoryListFilter, MemoryStore } from '../ports/memory-store.js';

/**
 * Drizzle schema for the Postgres `memories` table — the same columns the SQLite adapter defines, so
 * one `Memory` shape serves both.
 *
 * Two column choices are load-bearing rather than incidental:
 * - **`doublePrecision` for `confidence`, not `real`.** SQLite's `REAL` is a float**8**; Postgres
 *   `real` is a float**4**, which holds only ~7 significant decimal digits. Ordinary values are fine —
 *   Postgres formats float4 output with shortest-round-trip text, so `0.85` really does come back as
 *   `0.85` (measured; the obvious worry is unfounded). The loss is at precision: `0.123456789012345`
 *   stored as `real` reads back `0.12345679`, silently, while the SQLite adapter returns it intact.
 *   Two surfaces disagreeing about a stored value is the thing to avoid, so match SQLite's width.
 * - **`jsonb` for `metadata`.** The SQLite adapter stores JSON text and parses on read; `jsonb` is the
 *   native equivalent, and Drizzle hands back a parsed object either way.
 */
const memories = pgTable('memories', {
  id: text('id').$type<MemoryId>().primaryKey(),
  // Tenant scope (FR-52, ADR-0033).
  tenantId: text('tenant_id').$type<TenantId>().notNull().default(DEFAULT_TENANT_ID),
  // Project scope within the tenant (FR-66, ADR-0037).
  projectId: text('project_id').$type<ProjectId>().notNull().default(DEFAULT_PROJECT_ID),
  lineageId: text('lineage_id').$type<MemoryLineageId>().notNull(),
  kind: text('kind').$type<MemoryKind>().notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  scope: text('scope').notNull(),
  confidence: doublePrecision('confidence').notNull(),
  metadata: jsonb('metadata').$type<MemoryMetadata>().notNull(),
  version: integer('version').notNull(),
  supersedes: text('supersedes').$type<MemoryId>(),
  supersededBy: text('superseded_by').$type<MemoryId>(),
  createdAt: text('created_at').notNull(),
});

/**
 * Schema for the Postgres MemoryStore (F-056, ADR-0059 §2).
 *
 * The adapter does **not** create these itself — unlike the SQLite adapter, which self-provisions on
 * construction. On Postgres the composition root applies every package's migrations once, under an
 * advisory lock, because a self-provisioning adapter in a multi-replica deployment means concurrent
 * DDL on boot. The package that owns the schema still owns its DDL; it just does not run it.
 */
export const pgMemoryMigrations: readonly { id: string; up: readonly string[] }[] = [
  {
    id: 'f056-memories-001',
    up: [
      `CREATE TABLE IF NOT EXISTS memories (
        id text PRIMARY KEY,
        tenant_id text NOT NULL DEFAULT '${DEFAULT_TENANT_ID}',
        project_id text NOT NULL DEFAULT '${DEFAULT_PROJECT_ID}',
        lineage_id text NOT NULL,
        kind text NOT NULL,
        title text NOT NULL,
        body text NOT NULL,
        scope text NOT NULL,
        confidence double precision NOT NULL,
        metadata jsonb NOT NULL,
        version integer NOT NULL,
        supersedes text,
        superseded_by text,
        created_at text NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_memories_lineage
         ON memories (tenant_id, project_id, lineage_id)`,
      // Partial index: every "what is current" read filters `superseded_by IS NULL`, and superseded
      // rows accumulate forever, so indexing only the live ones keeps it small.
      `CREATE INDEX IF NOT EXISTS idx_memories_current
         ON memories (tenant_id, project_id) WHERE superseded_by IS NULL`,
    ],
  },
];

type MemoryRow = typeof memories.$inferSelect;

/** Project a row to the scope-agnostic {@link Memory} domain shape (scope is a storage concern). */
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
 * Postgres {@link MemoryStore} (self-hosted/cloud, ADR-0003/0026/0059) over the storage
 * `PostgresStore`'s Drizzle handle — the same contract the SQLite adapter implements, held to the same
 * shared conformance suite including tenant/project isolation.
 *
 * **Tables must already exist** ({@link pgMemoryMigrations}, applied by the composition root). A
 * missing table fails loud on first query rather than returning a silent empty result.
 *
 * **Scope (FR-52/FR-66, ADR-0033/0037):** every row carries `tenant_id` + `project_id`; the returned
 * store is bound to the defaults and `forTenant`/`forProject` rebind. All reads filter by the bound
 * scope and all writes stamp it.
 */
export function createPostgresMemoryStore(db: NodePgDatabase): MemoryStore {
  function storeFor(tenantId: TenantId, projectId: ProjectId): MemoryStore {
    const inScope = and(eq(memories.tenantId, tenantId), eq(memories.projectId, projectId));
    return {
      async add(memory) {
        await db.insert(memories).values({ ...memory, tenantId, projectId });
      },

      async supersede(previousId, next) {
        // One transaction, so a lineage never has two current versions (the SQLite adapter's rule).
        await db.transaction(async (tx) => {
          await tx
            .update(memories)
            .set({ supersededBy: next.id })
            .where(and(eq(memories.id, previousId), inScope));
          await tx.insert(memories).values({ ...next, tenantId, projectId });
        });
      },

      async getById(id: MemoryId) {
        const rows = await db
          .select()
          .from(memories)
          .where(and(eq(memories.id, id), inScope))
          .limit(1);
        const row = rows[0];
        return row === undefined ? undefined : toMemory(row);
      },

      async getCurrent(lineageId: MemoryLineageId) {
        const rows = await db
          .select()
          .from(memories)
          .where(and(eq(memories.lineageId, lineageId), isNull(memories.supersededBy), inScope))
          .limit(1);
        const row = rows[0];
        return row === undefined ? undefined : toMemory(row);
      },

      async listVersions(lineageId: MemoryLineageId) {
        const rows = await db
          .select()
          .from(memories)
          .where(and(eq(memories.lineageId, lineageId), inScope))
          .orderBy(asc(memories.version));
        return rows.map(toMemory);
      },

      async listCurrent(filter?: MemoryListFilter) {
        const conditions: (SQL | undefined)[] = [isNull(memories.supersededBy), inScope];
        if (filter?.kind !== undefined) conditions.push(eq(memories.kind, filter.kind));
        if (filter?.scope !== undefined) conditions.push(eq(memories.scope, filter.scope));
        const rows = await db
          .select()
          .from(memories)
          .where(and(...conditions))
          .orderBy(asc(memories.createdAt), asc(memories.id));
        return rows.map(toMemory);
      },

      async countCurrent(filter?: MemoryListFilter) {
        const conditions: (SQL | undefined)[] = [isNull(memories.supersededBy), inScope];
        if (filter?.kind !== undefined) conditions.push(eq(memories.kind, filter.kind));
        if (filter?.scope !== undefined) conditions.push(eq(memories.scope, filter.scope));
        const rows = await db
          .select({ value: sql<string>`count(*)` })
          .from(memories)
          .where(and(...conditions));
        // Postgres `count(*)` is bigint, which node-postgres returns as a STRING to avoid silently
        // truncating past 2^53. The port returns a number, so parse rather than cast.
        return Number(rows[0]?.value ?? 0);
      },

      async exportAll() {
        const rows = await db
          .select()
          .from(memories)
          .where(inScope)
          .orderBy(asc(memories.createdAt), asc(memories.id));
        return rows.map(toMemory);
      },

      async deleteVersion(id: MemoryId) {
        await db.delete(memories).where(and(eq(memories.id, id), inScope));
      },

      async deleteLineage(lineageId: MemoryLineageId) {
        await db.delete(memories).where(and(eq(memories.lineageId, lineageId), inScope));
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
