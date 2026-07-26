import { and, eq, or, sql, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { doublePrecision, jsonb, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
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
// is composite (tenant_id, project_id, id) — the same node exists independently per (tenant, project).
const nodes = pgTable(
  'graph_nodes',
  {
    tenantId: text('tenant_id').$type<TenantId>().notNull().default(DEFAULT_TENANT_ID),
    projectId: text('project_id').$type<ProjectId>().notNull().default(DEFAULT_PROJECT_ID),
    id: text('id').$type<NodeId>().notNull(),
    kind: text('kind').$type<NodeKind>().notNull(),
    key: text('key').notNull(),
    label: text('label').notNull(),
    metadata: jsonb('metadata').$type<GraphMetadata>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.projectId, table.id] })],
);

const edges = pgTable(
  'graph_edges',
  {
    tenantId: text('tenant_id').$type<TenantId>().notNull().default(DEFAULT_TENANT_ID),
    projectId: text('project_id').$type<ProjectId>().notNull().default(DEFAULT_PROJECT_ID),
    id: text('id').$type<EdgeId>().notNull(),
    from: text('from_id').$type<NodeId>().notNull(),
    to: text('to_id').$type<NodeId>().notNull(),
    kind: text('kind').$type<EdgeKind>().notNull(),
    rationale: text('rationale'),
    // float8 to match SQLite's REAL (see the postgres-memory-store note): PG `real` is float4 and
    // would silently truncate a confidence past ~7 significant digits.
    confidence: doublePrecision('confidence'),
    origin: text('origin').$type<EffectOrigin>(),
    metadata: jsonb('metadata').$type<GraphMetadata>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.projectId, table.id] })],
);

/**
 * Schema for the Postgres GraphStore (F-056, ADR-0059 §2). Applied by the composition root under an
 * advisory lock — the adapter never creates its own tables.
 */
export const pgGraphMigrations: readonly { id: string; up: readonly string[] }[] = [
  {
    id: 'f056-graph-001',
    up: [
      `CREATE TABLE IF NOT EXISTS graph_nodes (
        tenant_id text NOT NULL DEFAULT '${DEFAULT_TENANT_ID}',
        project_id text NOT NULL DEFAULT '${DEFAULT_PROJECT_ID}',
        id text NOT NULL,
        kind text NOT NULL,
        key text NOT NULL,
        label text NOT NULL,
        metadata jsonb NOT NULL,
        PRIMARY KEY (tenant_id, project_id, id)
      )`,
      `CREATE TABLE IF NOT EXISTS graph_edges (
        tenant_id text NOT NULL DEFAULT '${DEFAULT_TENANT_ID}',
        project_id text NOT NULL DEFAULT '${DEFAULT_PROJECT_ID}',
        id text NOT NULL,
        from_id text NOT NULL,
        to_id text NOT NULL,
        kind text NOT NULL,
        rationale text,
        confidence double precision,
        origin text,
        metadata jsonb NOT NULL,
        PRIMARY KEY (tenant_id, project_id, id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_nodes_kind_key
         ON graph_nodes (tenant_id, project_id, kind, key)`,
      `CREATE INDEX IF NOT EXISTS idx_edges_from
         ON graph_edges (tenant_id, project_id, kind, from_id)`,
      `CREATE INDEX IF NOT EXISTS idx_edges_to
         ON graph_edges (tenant_id, project_id, kind, to_id)`,
    ],
  },
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
 * Postgres {@link GraphStore} (self-hosted/cloud, ADR-0003/0026/0059) — the same contract the SQLite
 * adapter implements, held to the same shared conformance suite including tenant/project isolation.
 *
 * `getEffects` walks `EFFECT_LINK` edges with a **recursive CTE** (depth-bounded, path cycle-guard)
 * and ranks through the shared {@link selectBestRanked}, so all three adapters agree on which hit wins.
 * Two dialect differences from the SQLite twin, both load-bearing:
 * - **`strpos` replaces `instr`** for the cycle guard — the same "have I already visited this node on
 *   this path" test, spelled the way Postgres spells it.
 * - **Explicit `::double precision` and `::integer` casts** in the anchor term. Postgres requires the
 *   recursive term's column types to match the anchor's exactly; without the casts a literal `1` is
 *   `integer` while `ef.depth + 1` resolves fine, but `COALESCE(confidence, 1.0)` yields `numeric` in
 *   the anchor and `double precision` in the recursion, and the CTE is rejected at parse time.
 *
 * **Tables must already exist** ({@link pgGraphMigrations}).
 */
export function createPostgresGraphStore(db: NodePgDatabase): GraphStore {
  function storeFor(tenantId: TenantId, projectId: ProjectId): GraphStore {
    const nodeInScope = and(eq(nodes.tenantId, tenantId), eq(nodes.projectId, projectId));
    const edgeInScope = and(eq(edges.tenantId, tenantId), eq(edges.projectId, projectId));
    return {
      async addNode(node) {
        await db
          .insert(nodes)
          .values({ ...node, tenantId, projectId })
          .onConflictDoUpdate({
            target: [nodes.tenantId, nodes.projectId, nodes.id],
            set: { kind: node.kind, key: node.key, label: node.label, metadata: node.metadata },
          });
      },

      async addEdge(edge) {
        await db
          .insert(edges)
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
          });
      },

      async removeNode(id: NodeId) {
        await db.delete(nodes).where(and(eq(nodes.id, id), nodeInScope));
        await db.delete(edges).where(and(edgeInScope, or(eq(edges.from, id), eq(edges.to, id))));
      },

      async removeEdges(filter?: EdgeFilter) {
        const conditions: (SQL | undefined)[] = [edgeInScope];
        if (filter?.kind !== undefined) conditions.push(eq(edges.kind, filter.kind));
        if (filter?.from !== undefined) conditions.push(eq(edges.from, filter.from));
        if (filter?.to !== undefined) conditions.push(eq(edges.to, filter.to));
        await db.delete(edges).where(and(...conditions));
      },

      async getNode(id: NodeId) {
        const rows = await db
          .select()
          .from(nodes)
          .where(and(eq(nodes.id, id), nodeInScope))
          .limit(1);
        const row = rows[0];
        return row === undefined ? undefined : toNode(row);
      },

      async getNodeByKey(kind: NodeKind, key: string) {
        const rows = await db
          .select()
          .from(nodes)
          .where(and(eq(nodes.kind, kind), eq(nodes.key, key), nodeInScope))
          .limit(1);
        const row = rows[0];
        return row === undefined ? undefined : toNode(row);
      },

      async listNodes(filter?: NodeFilter) {
        const conditions: (SQL | undefined)[] = [nodeInScope];
        if (filter?.kind !== undefined) conditions.push(eq(nodes.kind, filter.kind));
        const rows = await db
          .select()
          .from(nodes)
          .where(and(...conditions));
        return rows.map(toNode);
      },

      async listEdges(filter?: EdgeFilter) {
        const conditions: (SQL | undefined)[] = [edgeInScope];
        if (filter?.kind !== undefined) conditions.push(eq(edges.kind, filter.kind));
        if (filter?.from !== undefined) conditions.push(eq(edges.from, filter.from));
        if (filter?.to !== undefined) conditions.push(eq(edges.to, filter.to));
        const rows = await db
          .select()
          .from(edges)
          .where(and(...conditions));
        return rows.map(toEdge);
      },

      async countNodes(filter?: NodeFilter) {
        const conditions: (SQL | undefined)[] = [nodeInScope];
        if (filter?.kind !== undefined) conditions.push(eq(nodes.kind, filter.kind));
        const rows = await db
          .select({ value: sql<string>`count(*)` })
          .from(nodes)
          .where(and(...conditions));
        // bigint arrives as a string from node-postgres — parse, do not cast.
        return Number(rows[0]?.value ?? 0);
      },

      async countEdges(filter?: EdgeFilter) {
        const conditions: (SQL | undefined)[] = [edgeInScope];
        if (filter?.kind !== undefined) conditions.push(eq(edges.kind, filter.kind));
        if (filter?.from !== undefined) conditions.push(eq(edges.from, filter.from));
        if (filter?.to !== undefined) conditions.push(eq(edges.to, filter.to));
        const rows = await db
          .select({ value: sql<string>`count(*)` })
          .from(edges)
          .where(and(...conditions));
        return Number(rows[0]?.value ?? 0);
      },

      async getEffects(source: NodeId, options?: GetEffectsOptions) {
        const maxDepth = options?.maxDepth ?? DEFAULT_EFFECT_DEPTH;
        const result = await db.execute(sql`
          WITH RECURSIVE effects(target, depth, score, path) AS (
            SELECT e.to_id,
                   1::integer,
                   COALESCE(e.confidence, 1.0)::double precision,
                   '|' || ${source} || '|' || e.to_id || '|'
            FROM graph_edges e
            WHERE e.kind = ${EFFECT_LINK_KIND} AND e.tenant_id = ${tenantId} AND e.project_id = ${projectId}
              AND e.from_id = ${source} AND e.to_id <> ${source}
            UNION ALL
            SELECT e.to_id,
                   ef.depth + 1,
                   (ef.score * COALESCE(e.confidence, 1.0))::double precision,
                   ef.path || e.to_id || '|'
            FROM graph_edges e
            JOIN effects ef ON e.from_id = ef.target
            WHERE e.kind = ${EFFECT_LINK_KIND} AND e.tenant_id = ${tenantId} AND e.project_id = ${projectId}
              AND ef.depth < ${maxDepth}
              AND strpos(ef.path, '|' || e.to_id || '|') = 0
          )
          SELECT target, depth, score, path FROM effects
        `);

        const rows = result.rows as Array<{
          target: NodeId;
          depth: number;
          score: number;
          path: string;
        }>;

        const candidates: RawEffectHit[] = rows.map((row) => ({
          nodeId: row.target,
          path: parsePath(row.path),
          distance: Number(row.depth),
          score: Number(row.score),
        }));

        const hits: EffectHit[] = [];
        for (const ranked of selectBestRanked(candidates)) {
          const nodeRows = await db
            .select()
            .from(nodes)
            .where(and(eq(nodes.id, ranked.nodeId), nodeInScope))
            .limit(1);
          const node = nodeRows[0];
          if (node !== undefined) hits.push({ ...ranked, node: toNode(node) });
        }
        return hits;
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
