import { and, eq, sql, type SQL } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
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

const nodes = sqliteTable('graph_nodes', {
  id: text('id').$type<NodeId>().primaryKey(),
  kind: text('kind').$type<NodeKind>().notNull(),
  key: text('key').notNull(),
  label: text('label').notNull(),
  metadata: text('metadata', { mode: 'json' }).$type<GraphMetadata>().notNull(),
});

const edges = sqliteTable('graph_edges', {
  id: text('id').$type<EdgeId>().primaryKey(),
  from: text('from_id').$type<NodeId>().notNull(),
  to: text('to_id').$type<NodeId>().notNull(),
  kind: text('kind').$type<EdgeKind>().notNull(),
  rationale: text('rationale'),
  confidence: real('confidence'),
  origin: text('origin').$type<EffectOrigin>(),
  metadata: text('metadata', { mode: 'json' }).$type<GraphMetadata>().notNull(),
});

const DDL: readonly SQL[] = [
  sql`CREATE TABLE IF NOT EXISTS graph_nodes (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    key TEXT NOT NULL,
    label TEXT NOT NULL,
    metadata TEXT NOT NULL
  )`,
  sql`CREATE TABLE IF NOT EXISTS graph_edges (
    id TEXT PRIMARY KEY,
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    rationale TEXT,
    confidence REAL,
    origin TEXT,
    metadata TEXT NOT NULL
  )`,
  sql`CREATE INDEX IF NOT EXISTS idx_nodes_kind_key ON graph_nodes (kind, key)`,
  sql`CREATE INDEX IF NOT EXISTS idx_edges_from ON graph_edges (kind, from_id)`,
  sql`CREATE INDEX IF NOT EXISTS idx_edges_to ON graph_edges (kind, to_id)`,
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
 * SQLite {@link GraphStore} (local default, ADR-0003/0005) over the storage `SqliteStore.db`.
 * Creates the `graph_nodes`/`graph_edges` tables on construction (drizzle-kit migrations are F-024).
 * `getEffects` walks `EFFECT_LINK` edges with a **recursive CTE** (depth-bounded, path cycle-guard),
 * then ranks through the shared {@link selectBestRanked} for parity with the in-memory adapter.
 */
export function createSqliteGraphStore(db: BetterSQLite3Database): GraphStore {
  for (const statement of DDL) db.run(statement);

  return {
    addNode(node) {
      db.insert(nodes)
        .values(node)
        .onConflictDoUpdate({
          target: nodes.id,
          set: { kind: node.kind, key: node.key, label: node.label, metadata: node.metadata },
        })
        .run();
      return Promise.resolve();
    },

    addEdge(edge) {
      db.insert(edges)
        .values(edge)
        .onConflictDoUpdate({
          target: edges.id,
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

    getNode(id: NodeId) {
      const row = db.select().from(nodes).where(eq(nodes.id, id)).get();
      return Promise.resolve(row === undefined ? undefined : toNode(row));
    },

    getNodeByKey(kind: NodeKind, key: string) {
      const row = db
        .select()
        .from(nodes)
        .where(and(eq(nodes.kind, kind), eq(nodes.key, key)))
        .get();
      return Promise.resolve(row === undefined ? undefined : toNode(row));
    },

    listNodes(filter?: NodeFilter) {
      const query =
        filter?.kind === undefined
          ? db.select().from(nodes)
          : db.select().from(nodes).where(eq(nodes.kind, filter.kind));
      return Promise.resolve(query.all().map(toNode));
    },

    listEdges(filter?: EdgeFilter) {
      const conditions: SQL[] = [];
      if (filter?.kind !== undefined) conditions.push(eq(edges.kind, filter.kind));
      if (filter?.from !== undefined) conditions.push(eq(edges.from, filter.from));
      if (filter?.to !== undefined) conditions.push(eq(edges.to, filter.to));
      const query =
        conditions.length === 0
          ? db.select().from(edges)
          : db
              .select()
              .from(edges)
              .where(and(...conditions));
      return Promise.resolve(query.all().map(toEdge));
    },

    getEffects(source: NodeId, options?: GetEffectsOptions) {
      const maxDepth = options?.maxDepth ?? DEFAULT_EFFECT_DEPTH;
      const rows = db.all<{ target: NodeId; depth: number; score: number; path: string }>(sql`
        WITH RECURSIVE effects(target, depth, score, path) AS (
          SELECT e.to_id, 1, COALESCE(e.confidence, 1.0),
                 '|' || ${source} || '|' || e.to_id || '|'
          FROM graph_edges e
          WHERE e.kind = ${EFFECT_LINK_KIND} AND e.from_id = ${source} AND e.to_id <> ${source}
          UNION ALL
          SELECT e.to_id, ef.depth + 1, ef.score * COALESCE(e.confidence, 1.0),
                 ef.path || e.to_id || '|'
          FROM graph_edges e
          JOIN effects ef ON e.from_id = ef.target
          WHERE e.kind = ${EFFECT_LINK_KIND}
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
        const node = db.select().from(nodes).where(eq(nodes.id, ranked.nodeId)).get();
        if (node !== undefined) hits.push({ ...ranked, node: toNode(node) });
      }
      return Promise.resolve(hits);
    },
  };
}
