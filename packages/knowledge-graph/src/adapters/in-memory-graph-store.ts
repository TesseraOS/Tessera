import { DEFAULT_TENANT_ID, type TenantId } from '@tessera/core';
import {
  EFFECT_LINK_KIND,
  type EffectHit,
  type GraphEdge,
  type GraphNode,
  type NodeId,
} from '../domain.js';
import {
  DEFAULT_EFFECT_DEPTH,
  type EdgeFilter,
  type GetEffectsOptions,
  type GraphStore,
  type NodeFilter,
} from '../ports/graph-store.js';
import { selectBestRanked, type RawEffectHit } from '../effects/ranking.js';

/** One tenant's isolated node/edge maps. */
interface TenantGraph {
  nodes: Map<NodeId, GraphNode>;
  edges: Map<string, GraphEdge>;
}

/**
 * In-memory {@link GraphStore} — the reference adapter driving the conformance suite. `getEffects`
 * is a depth-bounded, cycle-guarded BFS over outgoing `EFFECT_LINK` edges, ranked through the shared
 * {@link selectBestRanked} so it matches the SQLite adapter exactly.
 *
 * **Tenancy (FR-52, ADR-0033):** node ids are deterministic from `(kind, key)`, so nodes/edges are
 * partitioned into a per-tenant graph; a store view reads/writes only its bound tenant (base view =
 * {@link DEFAULT_TENANT_ID}). Partitions are shared across views so `forTenant` is a cheap re-scoping.
 */
export function createInMemoryGraphStore(): GraphStore {
  const byTenant = new Map<TenantId, TenantGraph>();

  function graphFor(tenantId: TenantId): TenantGraph {
    let graph = byTenant.get(tenantId);
    if (graph === undefined) {
      graph = { nodes: new Map<NodeId, GraphNode>(), edges: new Map<string, GraphEdge>() };
      byTenant.set(tenantId, graph);
    }
    return graph;
  }

  function storeFor(tenantId: TenantId): GraphStore {
    const { nodes, edges } = graphFor(tenantId);

    function outgoingEffectEdges(from: NodeId): GraphEdge[] {
      const result: GraphEdge[] = [];
      for (const edge of edges.values()) {
        if (edge.kind === EFFECT_LINK_KIND && edge.from === from) result.push(edge);
      }
      return result;
    }

    return {
      addNode(node) {
        nodes.set(node.id, node);
        return Promise.resolve();
      },

      addEdge(edge) {
        edges.set(edge.id, edge);
        return Promise.resolve();
      },

      getNode(id) {
        return Promise.resolve(nodes.get(id));
      },

      getNodeByKey(kind, key) {
        for (const node of nodes.values()) {
          if (node.kind === kind && node.key === key) return Promise.resolve(node);
        }
        return Promise.resolve(undefined);
      },

      listNodes(filter?: NodeFilter) {
        const result = [...nodes.values()].filter(
          (node) => filter?.kind === undefined || node.kind === filter.kind,
        );
        return Promise.resolve(result);
      },

      listEdges(filter?: EdgeFilter) {
        const result = [...edges.values()].filter(
          (edge) =>
            (filter?.kind === undefined || edge.kind === filter.kind) &&
            (filter?.from === undefined || edge.from === filter.from) &&
            (filter?.to === undefined || edge.to === filter.to),
        );
        return Promise.resolve(result);
      },

      getEffects(source: NodeId, options?: GetEffectsOptions) {
        const maxDepth = options?.maxDepth ?? DEFAULT_EFFECT_DEPTH;
        const candidates: RawEffectHit[] = [];
        const queue: RawEffectHit[] = [{ nodeId: source, path: [source], distance: 0, score: 1 }];

        while (queue.length > 0) {
          const current = queue.shift();
          if (current === undefined || current.distance >= maxDepth) continue;
          for (const edge of outgoingEffectEdges(current.nodeId)) {
            if (current.path.includes(edge.to)) continue; // cycle guard
            const next: RawEffectHit = {
              nodeId: edge.to,
              path: [...current.path, edge.to],
              distance: current.distance + 1,
              score: current.score * (edge.confidence ?? 1),
            };
            candidates.push(next);
            queue.push(next);
          }
        }

        const hits: EffectHit[] = [];
        for (const ranked of selectBestRanked(candidates)) {
          const node = nodes.get(ranked.nodeId);
          if (node !== undefined) hits.push({ ...ranked, node });
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
