import { and, eq, or, sql, type SQL } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import {
  DEFAULT_PROJECT_ID,
  DEFAULT_TENANT_ID,
  type ProjectId,
  type TenantId,
} from '@tessera/core';
import {
  EFFECT_LINK_KIND,
  type EdgeId,
  type EdgeKind,
  type EffectHit,
  type EffectOrigin,
  type GraphEdge,
  type GraphMetadata,
  type GraphNode,
  type NodeId,
  type NodeKind,
} from '../domain.js';
import {
  DEFAULT_EFFECT_DEPTH,
  type EdgeFilter,
  type GetEffectsOptions,
  type GraphStore,
  type NodeFilter,
} from '../ports/graph-store.js';
import { selectBestRanked, type RawEffectHit } from '../effects/ranking.js';

// Scope (FR-52/FR-66, ADR-0033/0037): node ids are deterministic from (kind, key), so the primary key
// is composite (tenant_id, project_id, id) — the same node can exist independently per (tenant, project).
const nodes = sqliteTable('graph_nodes', {
  tenantId: text('tenant_id').$type<TenantId>().notNull().default(DEFAULT_TENANT_ID),
  projectId: text('project_id').$type<ProjectId>().notNull().default(DEFAULT_PROJECT_ID),
  id: text('id').$type<NodeId>().notNull(),
  kind: text('kind').$type<NodeKind>().notNull(),
  key: text('key').notNull(),
  label: text('label').notNull(),
  metadata: text('metadata', { mode: 'json' }).$type<GraphMetadata>().notNull(),
});

const edges = sqliteTable('graph_edges', {
  tenantId: text('tenant_id').$type<TenantId>().notNull().default(DEFAULT_TENANT_ID),
  projectId: text('project_id').$type<ProjectId>().notNull().default(DEFAULT_PROJECT_ID),
  id: text('id').$type<EdgeId>().notNull(),
  from: text('from_id').$type<NodeId>().notNull(),
  to: text('to_id').$type<NodeId>().notNull(),
  kind: text('kind').$type<EdgeKind>().notNull(),
  rationale: text('rationale'),
  confidence: real('confidence'),
  origin: text('origin').$type<EffectOrigin>(),
  metadata: text('metadata', { mode: 'json' }).$type<GraphMetadata>().notNull(),
});

const TENANT_DEFAULT = sql.raw(DEFAULT_TENANT_ID);
const PROJECT_DEFAULT = sql.raw(DEFAULT_PROJECT_ID);

const DDL: readonly SQL[] = [
  sql`CREATE TABLE IF NOT EXISTS graph_nodes (
    tenant_id TEXT NOT NULL DEFAULT '${TENANT_DEFAULT}',
    project_id TEXT NOT NULL DEFAULT '${PROJECT_DEFAULT}',
    id TEXT NOT NULL,
    kind TEXT NOT NULL,
    key TEXT NOT NULL,
    label TEXT NOT NULL,
    metadata TEXT NOT NULL,
    PRIMARY KEY (tenant_id, project_id, id)
  )`,
  sql`CREATE TABLE IF NOT EXISTS graph_edges (
    tenant_id TEXT NOT NULL DEFAULT '${TENANT_DEFAULT}',
    project_id TEXT NOT NULL DEFAULT '${PROJECT_DEFAULT}',
    id TEXT NOT NULL,
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    rationale TEXT,
    confidence REAL,
    origin TEXT,
    metadata TEXT NOT NULL,
    PRIMARY KEY (tenant_id, project_id, id)
  )`,
  sql`CREATE INDEX IF NOT EXISTS idx_nodes_kind_key ON graph_nodes (tenant_id, project_id, kind, key)`,
  sql`CREATE INDEX IF NOT EXISTS idx_edges_from ON graph_edges (tenant_id, project_id, kind, from_id)`,
  sql`CREATE INDEX IF NOT EXISTS idx_edges_to ON graph_edges (tenant_id, project_id, kind, to_id)`,
];

type NodeRow = typeof nodes.$inferSelect;
type EdgeRow = typeof edges.$inferSelect;

function toNode(row: NodeRow): GraphNode {
  return { id: row.id, kind: row.kind, key: row.key, label: row.label, metadata: row.metadata };
}

function toEdge(row: EdgeRow): GraphEdge {
  return {
    id: row.id,
    from: row.from,
    to: row.to,
    kind: row.kind,
    rationale: row.rationale,
    confidence: row.confidence,
    origin: row.origin,
    metadata: row.metadata,
  };
}

/** Parse a CTE path string (`|src|a|b|`) into ordered node ids. */
function parsePath(path: string): NodeId[] {
  return path.split('|').filter((token) => token.length > 0) as NodeId[];
}

/**
 * Add the `tenant_id` / `project_id` scope columns to pre-existing graph tables (idempotent additive
 * migration; existing rows fall into the default tenant + default project — ADR-0033/0037). A table
 * created fresh already carries the composite `(tenant_id, project_id, id)` primary key; retrofitting
 * that key onto a legacy table is a table-rebuild left to the F-024 migration runner.
 */
function ensureScopeColumns(db: BetterSQLite3Database, table: 'graph_nodes' | 'graph_edges'): void {
  const columns = db.all<{ name: string }>(sql`PRAGMA table_info(${sql.raw(table)})`);
  if (columns.length === 0) return;
  const has = (name: string): boolean => columns.some((column) => column.name === name);
  if (!has('tenant_id')) {
    db.run(
      sql`ALTER TABLE ${sql.raw(table)} ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '${TENANT_DEFAULT}'`,
    );
  }
  if (!has('project_id')) {
    db.run(
      sql`ALTER TABLE ${sql.raw(table)} ADD COLUMN project_id TEXT NOT NULL DEFAULT '${PROJECT_DEFAULT}'`,
    );
  }
}

/**
 * SQLite {@link GraphStore} (local default, ADR-0003/0005) over the storage `SqliteStore.db`.
 * Creates the `graph_nodes`/`graph_edges` tables on construction (drizzle-kit migrations are F-024).
 * `getEffects` walks `EFFECT_LINK` edges with a **recursive CTE** (depth-bounded, path cycle-guard),
 * then ranks through the shared {@link selectBestRanked} for parity with the in-memory adapter.
 *
 * **Scope (FR-52/FR-66, ADR-0033/0037):** every node/edge carries a `tenant_id` + `project_id` (part of
 * the composite primary key). The base store operates in `(DEFAULT_TENANT_ID, DEFAULT_PROJECT_ID)`;
 * {@link GraphStore.forTenant}/{@link GraphStore.forProject} rebind them, filtering every read/write
 * **and both arms of the `getEffects` CTE** so effects never cross tenants or projects.
 */
export function createSqliteGraphStore(db: BetterSQLite3Database): GraphStore {
  for (const statement of DDL) db.run(statement);
  ensureScopeColumns(db, 'graph_nodes');
  ensureScopeColumns(db, 'graph_edges');

  function storeFor(tenantId: TenantId, projectId: ProjectId): GraphStore {
    const nodeInScope = and(eq(nodes.tenantId, tenantId), eq(nodes.projectId, projectId));
    const edgeInScope = and(eq(edges.tenantId, tenantId), eq(edges.projectId, projectId));
    return {
      addNode(node) {
        db.insert(nodes)
          .values({ ...node, tenantId, projectId })
          .onConflictDoUpdate({
            target: [nodes.tenantId, nodes.projectId, nodes.id],
            set: { kind: node.kind, key: node.key, label: node.label, metadata: node.metadata },
          })
          .run();
        return Promise.resolve();
      },

      addEdge(edge) {
        db.insert(edges)
          .values({ ...edge, tenantId, projectId })
          .onConflictDoUpdate({
            target: [edges.tenantId, edges.projectId, edges.id],
            set: {
              kind: edge.kind,
              rationale: edge.rationale,
              confidence: edge.confidence,
              origin: edge.origin,
              metadata: edge.metadata,
            },
          })
          .run();
        return Promise.resolve();
      },

      removeNode(id: NodeId) {
        db.delete(nodes)
          .where(and(eq(nodes.id, id), nodeInScope))
          .run();
        db.delete(edges)
          .where(and(edgeInScope, or(eq(edges.from, id), eq(edges.to, id))))
          .run();
        return Promise.resolve();
      },

      removeEdges(filter?: EdgeFilter) {
        const conditions: (SQL | undefined)[] = [edgeInScope];
        if (filter?.kind !== undefined) conditions.push(eq(edges.kind, filter.kind));
        if (filter?.from !== undefined) conditions.push(eq(edges.from, filter.from));
        if (filter?.to !== undefined) conditions.push(eq(edges.to, filter.to));
        db.delete(edges)
          .where(and(...conditions))
          .run();
        return Promise.resolve();
      },

      getNode(id: NodeId) {
        const row = db
          .select()
          .from(nodes)
          .where(and(eq(nodes.id, id), nodeInScope))
          .get();
        return Promise.resolve(row === undefined ? undefined : toNode(row));
      },

      getNodeByKey(kind: NodeKind, key: string) {
        const row = db
          .select()
          .from(nodes)
          .where(and(eq(nodes.kind, kind), eq(nodes.key, key), nodeInScope))
          .get();
        return Promise.resolve(row === undefined ? undefined : toNode(row));
      },

      listNodes(filter?: NodeFilter) {
        const conditions: (SQL | undefined)[] = [nodeInScope];
        if (filter?.kind !== undefined) conditions.push(eq(nodes.kind, filter.kind));
        return Promise.resolve(
          db
            .select()
            .from(nodes)
            .where(and(...conditions))
            .all()
            .map(toNode),
        );
      },

      listEdges(filter?: EdgeFilter) {
        const conditions: (SQL | undefined)[] = [edgeInScope];
        if (filter?.kind !== undefined) conditions.push(eq(edges.kind, filter.kind));
        if (filter?.from !== undefined) conditions.push(eq(edges.from, filter.from));
        if (filter?.to !== undefined) conditions.push(eq(edges.to, filter.to));
        return Promise.resolve(
          db
            .select()
            .from(edges)
            .where(and(...conditions))
            .all()
            .map(toEdge),
        );
      },

      countNodes(filter?: NodeFilter) {
        const conditions: (SQL | undefined)[] = [nodeInScope];
        if (filter?.kind !== undefined) conditions.push(eq(nodes.kind, filter.kind));
        const row = db
          .select({ value: sql<number>`count(*)` })
          .from(nodes)
          .where(and(...conditions))
          .get();
        return Promise.resolve(row?.value ?? 0);
      },

      countEdges(filter?: EdgeFilter) {
        const conditions: (SQL | undefined)[] = [edgeInScope];
        if (filter?.kind !== undefined) conditions.push(eq(edges.kind, filter.kind));
        if (filter?.from !== undefined) conditions.push(eq(edges.from, filter.from));
        if (filter?.to !== undefined) conditions.push(eq(edges.to, filter.to));
        const row = db
          .select({ value: sql<number>`count(*)` })
          .from(edges)
          .where(and(...conditions))
          .get();
        return Promise.resolve(row?.value ?? 0);
      },

      getEffects(source: NodeId, options?: GetEffectsOptions) {
        const maxDepth = options?.maxDepth ?? DEFAULT_EFFECT_DEPTH;
        const rows = db.all<{ target: NodeId; depth: number; score: number; path: string }>(sql`
          WITH RECURSIVE effects(target, depth, score, path) AS (
            SELECT e.to_id, 1, COALESCE(e.confidence, 1.0),
                   '|' || ${source} || '|' || e.to_id || '|'
            FROM graph_edges e
            WHERE e.kind = ${EFFECT_LINK_KIND} AND e.tenant_id = ${tenantId} AND e.project_id = ${projectId}
              AND e.from_id = ${source} AND e.to_id <> ${source}
            UNION ALL
            SELECT e.to_id, ef.depth + 1, ef.score * COALESCE(e.confidence, 1.0),
                   ef.path || e.to_id || '|'
            FROM graph_edges e
            JOIN effects ef ON e.from_id = ef.target
            WHERE e.kind = ${EFFECT_LINK_KIND} AND e.tenant_id = ${tenantId} AND e.project_id = ${projectId}
              AND ef.depth < ${maxDepth}
              AND instr(ef.path, '|' || e.to_id || '|') = 0
          )
          SELECT target, depth, score, path FROM effects
        `);

        const candidates: RawEffectHit[] = rows.map((row) => ({
          nodeId: row.target,
          path: parsePath(row.path),
          distance: row.depth,
          score: row.score,
        }));

        const hits: EffectHit[] = [];
        for (const ranked of selectBestRanked(candidates)) {
          const node = db
            .select()
            .from(nodes)
            .where(and(eq(nodes.id, ranked.nodeId), nodeInScope))
            .get();
          if (node !== undefined) hits.push({ ...ranked, node: toNode(node) });
        }
        return Promise.resolve(hits);
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
