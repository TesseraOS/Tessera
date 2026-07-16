import { describe, expect, it } from 'vitest';
import { NotFoundError, ValidationError } from '@tessera/core';
import { createInMemoryGraphStore } from '../adapters/in-memory-graph-store.js';
import { createKnowledgeGraphService } from './knowledge-graph-service.js';

function service() {
  return createKnowledgeGraphService(createInMemoryGraphStore());
}

describe('createKnowledgeGraphService', () => {
  it('asserts a manual effect-link and finds the dependent via get_effects', async () => {
    const subject = service();
    await subject.upsertNode({ kind: 'symbol', key: 'a', label: 'A' });
    await subject.upsertNode({ kind: 'symbol', key: 'b', label: 'B' });

    const link = await subject.assertEffectLink({
      from: { kind: 'symbol', key: 'a' },
      to: { kind: 'symbol', key: 'b' },
      rationale: 'b must be reviewed when a changes',
    });

    expect(link.kind).toBe('EFFECT_LINK');
    expect(link.origin).toBe('manual');
    const effects = await subject.getEffects({ kind: 'symbol', key: 'a' });
    expect(effects.map((hit) => hit.node.key)).toEqual(['b']);
  });

  it('derives static effect-links from import edges (inverse direction)', async () => {
    const subject = service();
    await subject.upsertNode({ kind: 'file', key: 'app.ts', label: 'app' });
    await subject.upsertNode({ kind: 'file', key: 'util.ts', label: 'util' });
    await subject.upsertEdge({
      from: { kind: 'file', key: 'app.ts' },
      to: { kind: 'file', key: 'util.ts' },
      kind: 'imports',
    });

    expect(await subject.deriveStaticEffectLinks()).toBe(1);

    const effects = await subject.getEffects({ kind: 'file', key: 'util.ts' });
    expect(effects.map((hit) => hit.node.key)).toEqual(['app.ts']);
    expect(effects[0]?.score ?? 0).toBeCloseTo(0.9);
  });

  it('throws NotFound for get_effects on an unknown node', async () => {
    await expect(service().getEffects({ kind: 'file', key: 'missing' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('rejects an invalid node with a ValidationError', async () => {
    await expect(
      service().upsertNode({ kind: 'file', key: '', label: 'x' } as never),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an effect-link with an empty rationale', async () => {
    const subject = service();
    await subject.upsertNode({ kind: 'file', key: 'a', label: 'a' });
    await subject.upsertNode({ kind: 'file', key: 'b', label: 'b' });

    await expect(
      subject.assertEffectLink({
        from: { kind: 'file', key: 'a' },
        to: { kind: 'file', key: 'b' },
        rationale: '',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('queryGraph returns a coherent subgraph, filtered by kind and capped by limit', async () => {
    const subject = service();
    await subject.upsertNode({ kind: 'file', key: 'app.ts', label: 'app' });
    await subject.upsertNode({ kind: 'file', key: 'util.ts', label: 'util' });
    await subject.upsertNode({ kind: 'symbol', key: 'helper', label: 'helper' });
    await subject.upsertEdge({
      from: { kind: 'file', key: 'app.ts' },
      to: { kind: 'file', key: 'util.ts' },
      kind: 'imports',
    });

    // Full graph: 3 nodes, 1 edge.
    const all = await subject.queryGraph();
    expect(all.nodes).toHaveLength(3);
    expect(all.edges).toHaveLength(1);

    // Kind filter drops the edge whose endpoints are no longer both present (coherent subgraph).
    const filesOnlyEdges = (await subject.queryGraph({ nodeKinds: ['symbol'] })).edges;
    expect(filesOnlyEdges).toHaveLength(0);
    const fileNodes = await subject.queryGraph({ nodeKinds: ['file'] });
    expect(fileNodes.nodes.map((node) => node.kind)).toEqual(['file', 'file']);
    expect(fileNodes.edges).toHaveLength(1);

    // Limit caps the node set; edges are confined to the returned nodes.
    const capped = await subject.queryGraph({ limit: 1 });
    expect(capped.nodes).toHaveLength(1);
    expect(capped.edges).toHaveLength(0);
  });

  it('exportAll returns the complete graph, unbounded by the queryGraph display limit (F-047)', async () => {
    const subject = service();
    await subject.upsertNode({ kind: 'file', key: 'a.ts', label: 'a' });
    await subject.upsertNode({ kind: 'file', key: 'b.ts', label: 'b' });
    await subject.upsertEdge({
      from: { kind: 'file', key: 'a.ts' },
      to: { kind: 'file', key: 'b.ts' },
      kind: 'imports',
    });

    // queryGraph caps at the requested limit; an export must be exhaustive (NFR-13).
    expect((await subject.queryGraph({ limit: 1 })).nodes).toHaveLength(1);
    const exported = await subject.exportAll();
    expect(exported.nodes).toHaveLength(2);
    expect(exported.edges).toHaveLength(1);
  });

  it('purge empties the graph, reports counts, and is tenant-scoped (F-047)', async () => {
    const subject = service();
    const acme = subject.forTenant('acme');
    const globex = subject.forTenant('globex');
    await acme.upsertNode({ kind: 'file', key: 'a.ts', label: 'a' });
    await acme.upsertNode({ kind: 'file', key: 'b.ts', label: 'b' });
    await acme.upsertEdge({
      from: { kind: 'file', key: 'a.ts' },
      to: { kind: 'file', key: 'b.ts' },
      kind: 'imports',
    });
    await globex.upsertNode({ kind: 'file', key: 'keep.ts', label: 'keep' });

    expect(await acme.purge()).toEqual({ nodes: 2, edges: 1 });
    expect(await acme.exportAll()).toEqual({ nodes: [], edges: [] });
    // Another tenant's graph is untouched by the erasure.
    expect((await globex.exportAll()).nodes).toHaveLength(1);
  });
});
