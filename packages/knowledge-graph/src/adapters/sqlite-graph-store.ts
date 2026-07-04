import { and, eq, or, sql, type SQL } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { DEFAULT_TENANT_ID, type TenantId } from '@tessera/core';
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

// Tenant scope (FR-52, ADR-0033): node ids are deterministic from (kind, key), so the primary key is
// composite (tenant_id, id) — the same node can exist independently per tenant.
const nodes = sqliteTable('graph_nodes', {
  tenantId: text('tenant_id').$type<TenantId>().notNull().default(DEFAULT_TENANT_ID),
  id: text('id').$type<NodeId>().notNull(),
  kind: text('kind').$type<NodeKind>().notNull(),
  key: text('key').notNull(),
  label: text('label').notNull(),
  metadata: text('metadata', { mode: 'json' }).$type<GraphMetadata>().notNull(),
});

const edges = sqliteTable('graph_edges', {
  tenantId: text('tenant_id').$type<TenantId>().notNull().default(DEFAULT_TENANT_ID),
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

const DDL: readonly SQL[] = [
  sql`CREATE TABLE IF NOT EXISTS graph_nodes (
    tenant_id TEXT NOT NULL DEFAULT '${TENANT_DEFAULT}',
    id TEXT NOT NULL,
    kind TEXT NOT NULL,
    key TEXT NOT NULL,
    label TEXT NOT NULL,
    metadata TEXT NOT NULL,
    PRIMARY KEY (tenant_id, id)
  )`,
  sql`CREATE TABLE IF NOT EXISTS graph_edges (
    tenant_id TEXT NOT NULL DEFAULT '${TENANT_DEFAULT}',
    id TEXT NOT NULL,
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    rationale TEXT,
    confidence REAL,
    origin TEXT,
    metadata TEXT NOT NULL,
    PRIMARY KEY (tenant_id, id)
  )`,
  sql`CREATE INDEX IF NOT EXISTS idx_nodes_kind_key ON graph_nodes (tenant_id, kind, key)`,
  sql`CREATE INDEX IF NOT EXISTS idx_edges_from ON graph_edges (tenant_id, kind, from_id)`,
  sql`CREATE INDEX IF NOT EXISTS idx_edges_to ON graph_edges (tenant_id, kind, to_id)`,
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

/** Add the `tenant_id` column to pre-existing graph tables (idempotent additive migration). */
function ensureTenantColumn(db: BetterSQLite3Database, table: 'graph_nodes' | 'graph_edges'): void {
  const columns = db.all<{ name: string }>(sql`PRAGMA table_info(${sql.raw(table)})`);
  if (columns.length > 0 && !columns.some((column) => column.name === 'tenant_id')) {
    db.run(
      sql`ALTER TABLE ${sql.raw(table)} ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '${TENANT_DEFAULT}'`,
    );
  }
}

/**
 * SQLite {@link GraphStore} (local default, ADR-0003/0005) over the storage `SqliteStore.db`.
 * Creates the `graph_nodes`/`graph_edges` tables on construction (drizzle-kit migrations are F-024).
 * `getEffects` walks `EFFECT_LINK` edges with a **recursive CTE** (depth-bounded, path cycle-guard),
 * then ranks through the shared {@link selectBestRanked} for parity with the in-memory adapter.
 *
 * **Tenancy (FR-52, ADR-0033):** every node/edge carries a `tenant_id` (part of the composite primary
 * key). The base store operates in {@link DEFAULT_TENANT_ID}; {@link GraphStore.forTenant} rebinds it,
 * filtering every read/write **and both arms of the `getEffects` CTE** so effects never cross tenants.
 */
export function createSqliteGraphStore(db: BetterSQLite3Database): GraphStore {
  for (const statement of DDL) db.run(statement);
  ensureTenantColumn(db, 'graph_nodes');
  ensureTenantColumn(db, 'graph_edges');

  function storeFor(tenantId: TenantId): GraphStore {
    const nodeInTenant = eq(nodes.tenantId, tenantId);
    const edgeInTenant = eq(edges.tenantId, tenantId);
    return {
      addNode(node) {
        db.insert(nodes)
          .values({ ...node, tenantId })
          .onConflictDoUpdate({
            target: [nodes.tenantId, nodes.id],
            set: { kind: node.kind, key: node.key, label: node.label, metadata: node.metadata },
          })
          .run();
        return Promise.resolve();
      },

      addEdge(edge) {
        db.insert(edges)
          .values({ ...edge, tenantId })
          .onConflictDoUpdate({
            target: [edges.tenantId, edges.id],
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
          .where(and(eq(nodes.id, id), nodeInTenant))
          .run();
        db.delete(edges)
          .where(and(edgeInTenant, or(eq(edges.from, id), eq(edges.to, id))))
          .run();
        return Promise.resolve();
      },

      removeEdges(filter?: EdgeFilter) {
        const conditions: SQL[] = [edgeInTenant];
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
          .where(and(eq(nodes.id, id), nodeInTenant))
          .get();
        return Promise.resolve(row === undefined ? undefined : toNode(row));
      },

      getNodeByKey(kind: NodeKind, key: string) {
        const row = db
          .select()
          .from(nodes)
          .where(and(eq(nodes.kind, kind), eq(nodes.key, key), nodeInTenant))
          .get();
        return Promise.resolve(row === undefined ? undefined : toNode(row));
      },

      listNodes(filter?: NodeFilter) {
        const conditions: SQL[] = [nodeInTenant];
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
        const conditions: SQL[] = [edgeInTenant];
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

      getEffects(source: NodeId, options?: GetEffectsOptions) {
        const maxDepth = options?.maxDepth ?? DEFAULT_EFFECT_DEPTH;
        const rows = db.all<{ target: NodeId; depth: number; score: number; path: string }>(sql`
          WITH RECURSIVE effects(target, depth, score, path) AS (
            SELECT e.to_id, 1, COALESCE(e.confidence, 1.0),
                   '|' || ${source} || '|' || e.to_id || '|'
            FROM graph_edges e
            WHERE e.kind = ${EFFECT_LINK_KIND} AND e.tenant_id = ${tenantId}
              AND e.from_id = ${source} AND e.to_id <> ${source}
            UNION ALL
            SELECT e.to_id, ef.depth + 1, ef.score * COALESCE(e.confidence, 1.0),
                   ef.path || e.to_id || '|'
            FROM graph_edges e
            JOIN effects ef ON e.from_id = ef.target
            WHERE e.kind = ${EFFECT_LINK_KIND} AND e.tenant_id = ${tenantId}
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
            .where(and(eq(nodes.id, ranked.nodeId), nodeInTenant))
            .get();
          if (node !== undefined) hits.push({ ...ranked, node: toNode(node) });
        }
        return Promise.resolve(hits);
      },

      forTenant(next) {
        return storeFor(next);
      },
    };
  }

  return storeFor(DEFAULT_TENANT_ID);
}
