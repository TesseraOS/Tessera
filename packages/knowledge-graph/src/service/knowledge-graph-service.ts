import { NotFoundError, ValidationError, type ProjectId, type TenantId } from '@tessera/core';
import type { z } from 'zod';
import {
  DEFAULT_GRAPH_LIMIT,
  EFFECT_LINK_KIND,
  edgeIdFor,
  nodeIdFor,
  type EdgeKind,
  type EffectHit,
  type GraphEdge,
  type GraphNode,
  type GraphQuery,
  type GraphSnapshot,
  type NodeId,
} from '../domain.js';
import type { EdgeFilter, GetEffectsOptions, GraphStore } from '../ports/graph-store.js';
import { staticEffectLinksFrom } from '../effects/static-derivation.js';
import {
  assertEffectLinkSchema,
  nodeRefSchema,
  upsertEdgeSchema,
  upsertNodeSchema,
  type AssertEffectLinkInput,
  type NodeRef,
  type UpsertEdgeInput,
  type UpsertNodeInput,
} from '../validation.js';

/** Parse with a domain schema, raising a typed {@link ValidationError} on failure. */
function parseOrThrow<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  input: unknown,
  message: string,
): z.output<TSchema> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(message, { details: { issues: result.error.issues } });
  }
  return result.data as z.output<TSchema>;
}

/** The knowledge-graph domain service — the surface REST (F-011) and MCP (F-012) expose. */
export interface KnowledgeGraphService {
  /** Upsert a node (idempotent by `(kind, key)`). */
  upsertNode(input: UpsertNodeInput): Promise<GraphNode>;
  /** Upsert a structural edge between two nodes (idempotent). */
  upsertEdge(input: UpsertEdgeInput): Promise<GraphEdge>;
  /** Assert an effect-link manually (FR-17/18). */
  assertEffectLink(input: AssertEffectLinkInput): Promise<GraphEdge>;
  /** Derive effect-links from the stored dependency edges (FR-18); returns the count added. */
  deriveStaticEffectLinks(): Promise<number>;
  /**
   * Remove a node and every edge incident to it (idempotent). Used to remove a deleted source file's
   * subgraph on re-ingest (F-040).
   */
  removeNode(ref: NodeRef): Promise<void>;
  /**
   * Remove edges matching the filter (idempotent). Used to replace a changed file's outgoing edges +
   * clear its stale derived effect-links on re-ingest (F-040), without touching other files' edges.
   */
  removeEdges(filter: { from?: NodeRef; to?: NodeRef; kind?: EdgeKind }): Promise<void>;
  /** What is affected if the referenced node changes — ranked dependents with paths (FR-19). */
  getEffects(node: NodeRef, options?: GetEffectsOptions): Promise<readonly EffectHit[]>;
  /**
   * A bounded subgraph for visualization (FR-42): up to `limit` nodes (optionally filtered by kind)
   * plus the edges that connect them (optionally filtered by kind). Deterministic + read-only.
   */
  queryGraph(filter?: GraphQuery): Promise<GraphSnapshot>;
  /**
   * The **complete** tenant-scoped graph — every node and edge, unbounded. Unlike
   * {@link KnowledgeGraphService.queryGraph} (capped at a display limit) this is exhaustive, because it
   * backs data-subject-rights export (NFR-13, F-047), where a partial answer would be wrong.
   */
  exportAll(): Promise<GraphSnapshot>;
  /**
   * Delete the tenant's entire graph — every edge, then every node (idempotent). Backs DSR erasure
   * (NFR-13, F-047). Returns what was removed.
   */
  purge(): Promise<{ readonly nodes: number; readonly edges: number }>;
  /**
   * How much graph this tenant has: total nodes, and effect-links specifically (FR-18). Backs the
   * workspace summary (`GET /v1/stats`, F-060) — counted at the store, never by listing.
   */
  counts(): Promise<{ readonly nodes: number; readonly effectLinks: number }>;
  /**
   * A view of this service confined to `tenantId` (FR-52, ADR-0033), reset to that tenant's
   * {@link DEFAULT_PROJECT_ID}. The base service operates in {@link DEFAULT_TENANT_ID}.
   */
  forTenant(tenantId: TenantId): KnowledgeGraphService;
  /**
   * A view of this service confined to `projectId` **within the current tenant** (FR-66, ADR-0037).
   * Chain after {@link KnowledgeGraphService.forTenant} for a full `(tenant, project)` scope.
   */
  forProject(projectId: ProjectId): KnowledgeGraphService;
}

/** Create a {@link KnowledgeGraphService} backed by a {@link GraphStore}. */
export function createKnowledgeGraphService(store: GraphStore): KnowledgeGraphService {
  function refToId(ref: { kind: GraphNode['kind']; key: string }): NodeId {
    return nodeIdFor(ref.kind, ref.key);
  }

  return {
    async upsertNode(input) {
      const parsed = parseOrThrow(upsertNodeSchema, input, 'invalid node');
      const node: GraphNode = {
        id: nodeIdFor(parsed.kind, parsed.key),
        kind: parsed.kind,
        key: parsed.key,
        label: parsed.label,
        metadata: parsed.metadata,
      };
      await store.addNode(node);
      return node;
    },

    async upsertEdge(input) {
      const parsed = parseOrThrow(upsertEdgeSchema, input, 'invalid edge');
      const from = refToId(parsed.from);
      const to = refToId(parsed.to);
      const edge: GraphEdge = {
        id: edgeIdFor(from, to, parsed.kind),
        from,
        to,
        kind: parsed.kind,
        rationale: null,
        confidence: null,
        origin: null,
        metadata: parsed.metadata,
      };
      await store.addEdge(edge);
      return edge;
    },

    async assertEffectLink(input) {
      const parsed = parseOrThrow(assertEffectLinkSchema, input, 'invalid effect-link');
      const from = refToId(parsed.from);
      const to = refToId(parsed.to);
      const edge: GraphEdge = {
        id: edgeIdFor(from, to, EFFECT_LINK_KIND),
        from,
        to,
        kind: EFFECT_LINK_KIND,
        rationale: parsed.rationale,
        confidence: parsed.confidence,
        origin: parsed.origin,
        metadata: parsed.metadata,
      };
      await store.addEdge(edge);
      return edge;
    },

    async deriveStaticEffectLinks() {
      const edges = await store.listEdges();
      const links = staticEffectLinksFrom(edges);
      await Promise.all(links.map((link) => store.addEdge(link)));
      return links.length;
    },

    async removeNode(ref) {
      const parsed = parseOrThrow(nodeRefSchema, ref, 'invalid node reference');
      await store.removeNode(nodeIdFor(parsed.kind, parsed.key));
    },

    async removeEdges(filter) {
      const storeFilter: EdgeFilter = {
        ...(filter.kind !== undefined ? { kind: filter.kind } : {}),
        ...(filter.from !== undefined ? { from: refToId(filter.from) } : {}),
        ...(filter.to !== undefined ? { to: refToId(filter.to) } : {}),
      };
      await store.removeEdges(storeFilter);
    },

    async getEffects(node, options) {
      const ref = parseOrThrow(nodeRefSchema, node, 'invalid node reference');
      const id = nodeIdFor(ref.kind, ref.key);
      if ((await store.getNode(id)) === undefined) {
        throw new NotFoundError('node not found', { details: { kind: ref.kind, key: ref.key } });
      }
      return store.getEffects(id, options);
    },

    async queryGraph(filter = {}) {
      const limit = filter.limit ?? DEFAULT_GRAPH_LIMIT;
      const nodeKinds =
        filter.nodeKinds && filter.nodeKinds.length > 0 ? new Set(filter.nodeKinds) : undefined;
      const edgeKinds =
        filter.edgeKinds && filter.edgeKinds.length > 0 ? new Set(filter.edgeKinds) : undefined;

      const allNodes = await store.listNodes();
      const selected = (
        nodeKinds ? allNodes.filter((node) => nodeKinds.has(node.kind)) : allNodes
      ).slice(0, Math.max(0, limit));
      const nodeIds = new Set(selected.map((node) => node.id));

      const allEdges = await store.listEdges();
      const edges = allEdges.filter(
        (edge) =>
          nodeIds.has(edge.from) &&
          nodeIds.has(edge.to) &&
          (edgeKinds === undefined || edgeKinds.has(edge.kind)),
      );

      return { nodes: selected, edges };
    },

    async exportAll() {
      // Unbounded by design — an export must be complete (NFR-13), never display-capped.
      const [nodes, edges] = await Promise.all([store.listNodes(), store.listEdges()]);
      return { nodes, edges };
    },

    async purge() {
      const [nodes, edges] = await Promise.all([store.listNodes(), store.listEdges()]);
      // Edges first, then nodes: removeNode already drops incident edges, but clearing edges up front
      // keeps the counts honest and leaves no dangling edge if a node id repeats.
      await store.removeEdges();
      for (const node of nodes) {
        await store.removeNode(node.id);
      }
      return { nodes: nodes.length, edges: edges.length };
    },

    async counts() {
      const [nodes, effectLinks] = await Promise.all([
        store.countNodes(),
        store.countEdges({ kind: EFFECT_LINK_KIND }),
      ]);
      return { nodes, effectLinks };
    },

    forTenant(tenantId) {
      return createKnowledgeGraphService(store.forTenant(tenantId));
    },

    forProject(projectId) {
      return createKnowledgeGraphService(store.forProject(projectId));
    },
  };
}
