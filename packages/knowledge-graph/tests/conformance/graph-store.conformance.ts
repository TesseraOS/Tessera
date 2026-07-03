import { describe, expect, it } from 'vitest';
import {
  EFFECT_LINK_KIND,
  edgeIdFor,
  nodeIdFor,
  type EdgeKind,
  type GraphEdge,
  type GraphNode,
  type NodeKind,
} from '../../src/domain';
import type { GraphStore } from '../../src/ports/graph-store';

export interface GraphStoreHarness {
  store: GraphStore;
  cleanup?: () => Promise<void>;
}

export type GraphStoreFactory = () => Promise<GraphStoreHarness>;

function node(kind: NodeKind, key: string): GraphNode {
  return { id: nodeIdFor(kind, key), kind, key, label: key, metadata: {} };
}

function effectLink(from: GraphNode, to: GraphNode, confidence: number): GraphEdge {
  return {
    id: edgeIdFor(from.id, to.id, EFFECT_LINK_KIND),
    from: from.id,
    to: to.id,
    kind: EFFECT_LINK_KIND,
    rationale: 'test effect-link',
    confidence,
    origin: 'manual',
    metadata: {},
  };
}

function structural(from: GraphNode, to: GraphNode, kind: EdgeKind): GraphEdge {
  return {
    id: edgeIdFor(from.id, to.id, kind),
    from: from.id,
    to: to.id,
    kind,
    rationale: null,
    confidence: null,
    origin: null,
    metadata: {},
  };
}

/** The behavioral contract every {@link GraphStore} adapter must satisfy (ADR-0003, ADR-0014). */
export function runGraphStoreConformance(name: string, makeStore: GraphStoreFactory): void {
  describe(`GraphStore conformance: ${name}`, () => {
    it('upserts a node idempotently and reads it by id and by key', async () => {
      const { store, cleanup } = await makeStore();
      try {
        const file = node('file', 'src/a.ts');
        await store.addNode(file);
        await store.addNode({ ...file, label: 'renamed' }); // upsert, not duplicate

        expect((await store.getNode(file.id))?.label).toBe('renamed');
        expect(await store.getNodeByKey('file', 'src/a.ts')).toEqual({ ...file, label: 'renamed' });
        expect(await store.listNodes({ kind: 'file' })).toHaveLength(1);
      } finally {
        await cleanup?.();
      }
    });

    it('upserts edges idempotently and filters listEdges', async () => {
      const { store, cleanup } = await makeStore();
      try {
        const a = node('file', 'a');
        const b = node('module', 'b');
        await store.addNode(a);
        await store.addNode(b);
        const edge = structural(a, b, 'imports');
        await store.addEdge(edge);
        await store.addEdge(edge); // idempotent

        expect(await store.listEdges({ kind: 'imports' })).toEqual([edge]);
        expect(await store.listEdges({ from: a.id })).toEqual([edge]);
        expect(await store.listEdges({ to: a.id })).toEqual([]);
      } finally {
        await cleanup?.();
      }
    });

    it('get_effects returns transitive dependents ranked, with paths', async () => {
      const { store, cleanup } = await makeStore();
      try {
        const a = node('symbol', 'a');
        const b = node('symbol', 'b');
        const c = node('symbol', 'c');
        for (const n of [a, b, c]) await store.addNode(n);
        await store.addEdge(effectLink(a, b, 0.9));
        await store.addEdge(effectLink(b, c, 0.8));

        const effects = await store.getEffects(a.id);

        expect(effects.map((hit) => hit.nodeId)).toEqual([b.id, c.id]); // b (closer) ranks above c
        expect(effects[0]?.path).toEqual([a.id, b.id]);
        expect(effects[0]?.distance).toBe(1);
        expect(effects[1]?.path).toEqual([a.id, b.id, c.id]);
        expect(effects[1]?.distance).toBe(2);
        expect(effects[1]?.score ?? 1).toBeCloseTo(0.72);
      } finally {
        await cleanup?.();
      }
    });

    it('get_effects is cycle-safe', async () => {
      const { store, cleanup } = await makeStore();
      try {
        const a = node('file', 'a');
        const b = node('file', 'b');
        await store.addNode(a);
        await store.addNode(b);
        await store.addEdge(effectLink(a, b, 1));
        await store.addEdge(effectLink(b, a, 1)); // cycle

        const effects = await store.getEffects(a.id);
        expect(effects.map((hit) => hit.nodeId)).toEqual([b.id]);
      } finally {
        await cleanup?.();
      }
    });

    it('get_effects respects maxDepth', async () => {
      const { store, cleanup } = await makeStore();
      try {
        const a = node('file', 'a');
        const b = node('file', 'b');
        const c = node('file', 'c');
        for (const n of [a, b, c]) await store.addNode(n);
        await store.addEdge(effectLink(a, b, 1));
        await store.addEdge(effectLink(b, c, 1));

        const effects = await store.getEffects(a.id, { maxDepth: 1 });
        expect(effects.map((hit) => hit.nodeId)).toEqual([b.id]);
      } finally {
        await cleanup?.();
      }
    });

    it('returns no effects for a node without outgoing effect-links', async () => {
      const { store, cleanup } = await makeStore();
      try {
        const lonely = node('file', 'lonely');
        await store.addNode(lonely);
        expect(await store.getEffects(lonely.id)).toEqual([]);
      } finally {
        await cleanup?.();
      }
    });

    it('isolates nodes/edges and effects by tenant (forTenant)', async () => {
      const { store, cleanup } = await makeStore();
      try {
        const a = store.forTenant('tenant-a');
        const b = store.forTenant('tenant-b');
        const x = node('symbol', 'x');
        const y = node('symbol', 'y');
        // Tenant A: x -> y effect-link.
        await a.addNode(x);
        await a.addNode(y);
        await a.addEdge(effectLink(x, y, 0.9));
        // Tenant B: only x (the SAME deterministic id), with a different label; no edges.
        await b.addNode({ ...x, label: 'b-label' });

        // The same node id is independent per tenant.
        expect((await a.getNode(x.id))?.label).toBe('x');
        expect((await b.getNode(x.id))?.label).toBe('b-label');
        expect(await b.getNode(y.id)).toBeUndefined();
        expect(await b.getNodeByKey('symbol', 'y')).toBeUndefined();

        // Listings are tenant-scoped.
        expect((await a.listNodes()).map((n) => n.id).sort()).toEqual([x.id, y.id].sort());
        expect((await b.listNodes()).map((n) => n.id)).toEqual([x.id]);
        expect(await b.listEdges()).toEqual([]);

        // Effect traversal never crosses tenants.
        expect((await a.getEffects(x.id)).map((hit) => hit.nodeId)).toEqual([y.id]);
        expect(await b.getEffects(x.id)).toEqual([]);

        // The default view (a distinct tenant) sees neither.
        expect(await store.getNode(x.id)).toBeUndefined();
        expect(await store.listNodes()).toEqual([]);
      } finally {
        await cleanup?.();
      }
    });
  });
}
