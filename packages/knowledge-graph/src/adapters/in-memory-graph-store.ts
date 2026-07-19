import {
  DEFAULT_PROJECT_ID,
  DEFAULT_TENANT_ID,
  type ProjectId,
  type TenantId,
} from '@tessera/core';
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

/** One `(tenant, project)` scope's isolated node/edge maps. */
interface ScopeGraph {
  nodes: Map<NodeId, GraphNode>;
  edges: Map<string, GraphEdge>;
}

/** A collision-free key for a `(tenant, project)` partition (JSON-encoded so no id can alias another). */
function scopeKey(tenantId: TenantId, projectId: ProjectId): string {
  return JSON.stringify([tenantId, projectId]);
}

/**
 * In-memory {@link GraphStore} — the reference adapter driving the conformance suite. `getEffects`
 * is a depth-bounded, cycle-guarded BFS over outgoing `EFFECT_LINK` edges, ranked through the shared
 * {@link selectBestRanked} so it matches the SQLite adapter exactly.
 *
 * **Scope (FR-52/FR-66, ADR-0033/0037):** node ids are deterministic from `(kind, key)`, so nodes/edges
 * are partitioned into a per-`(tenant, project)` graph; a store view reads/writes only its bound scope
 * (base view = `(DEFAULT_TENANT_ID, DEFAULT_PROJECT_ID)`). Partitions are shared across views so
 * `forTenant`/`forProject` are cheap re-scopings.
 */
export function createInMemoryGraphStore(): GraphStore {
  const byScope = new Map<string, ScopeGraph>();

  function graphFor(tenantId: TenantId, projectId: ProjectId): ScopeGraph {
    const key = scopeKey(tenantId, projectId);
    let graph = byScope.get(key);
    if (graph === undefined) {
      graph = { nodes: new Map<NodeId, GraphNode>(), edges: new Map<string, GraphEdge>() };
      byScope.set(key, graph);
    }
    return graph;
  }

  function storeFor(tenantId: TenantId, projectId: ProjectId): GraphStore {
    const { nodes, edges } = graphFor(tenantId, projectId);

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

      removeNode(id) {
        nodes.delete(id);
        for (const [edgeId, edge] of edges) {
          if (edge.from === id || edge.to === id) edges.delete(edgeId);
        }
        return Promise.resolve();
      },

      removeEdges(filter?: EdgeFilter) {
        for (const [edgeId, edge] of edges) {
          if (
            (filter?.kind === undefined || edge.kind === filter.kind) &&
            (filter?.from === undefined || edge.from === filter.from) &&
            (filter?.to === undefined || edge.to === filter.to)
          ) {
            edges.delete(edgeId);
          }
        }
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

      countNodes(filter?: NodeFilter) {
        let total = 0;
        for (const node of nodes.values()) {
          if (filter?.kind === undefined || node.kind === filter.kind) total += 1;
        }
        return Promise.resolve(total);
      },

      countEdges(filter?: EdgeFilter) {
        let total = 0;
        for (const edge of edges.values()) {
          if (
            (filter?.kind === undefined || edge.kind === filter.kind) &&
            (filter?.from === undefined || edge.from === filter.from) &&
            (filter?.to === undefined || edge.to === filter.to)
          ) {
            total += 1;
          }
        }
        return Promise.resolve(total);
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
        return storeFor(next, DEFAULT_PROJECT_ID);
      },

      forProject(next) {
        return storeFor(tenantId, next);
      },
    };
  }

  return storeFor(DEFAULT_TENANT_ID, DEFAULT_PROJECT_ID);
}
