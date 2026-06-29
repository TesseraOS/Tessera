import { describe, expect, it } from 'vitest';
import { createInMemoryGraphStore, createKnowledgeGraphService } from '@tessera/knowledge-graph';
import type { GraphStore } from '@tessera/knowledge-graph';
import { createGraphRetriever } from '../../src/adapters/graph-retriever';
import { createSymbolicRetriever } from '../../src/adapters/symbolic-retriever';
import { runRetrieverConformance } from '../conformance/retriever.conformance';

async function buildGraph(): Promise<GraphStore> {
  const store = createInMemoryGraphStore();
  const service = createKnowledgeGraphService(store);
  await service.upsertNode({ kind: 'symbol', key: 'parseQuery', label: 'parseQuery' });
  await service.upsertNode({ kind: 'symbol', key: 'parseQueryHelper', label: 'parseQueryHelper' });
  await service.upsertNode({ kind: 'file', key: 'app.ts', label: 'app.ts' });
  // app.ts references parseQuery; deriving static effect-links yields parseQuery -> app.ts.
  await service.upsertEdge({
    from: { kind: 'file', key: 'app.ts' },
    to: { kind: 'symbol', key: 'parseQuery' },
    kind: 'references',
  });
  await service.deriveStaticEffectLinks();
  return store;
}

runRetrieverConformance('graph', 'graph', async () => ({
  retriever: createGraphRetriever({ graphStore: await buildGraph() }),
  query: 'parseQuery',
}));

runRetrieverConformance('symbolic', 'symbolic', async () => ({
  retriever: createSymbolicRetriever({ graphStore: await buildGraph() }),
  query: 'parseQuery',
}));

describe('graph retriever', () => {
  it('surfaces a dependent by expanding effect-links from a lexical seed', async () => {
    const retriever = createGraphRetriever({ graphStore: await buildGraph() });

    const labels = (await retriever.retrieve({ text: 'parseQuery' })).map((c) => c.label);
    expect(labels).toContain('parseQuery'); // direct seed match
    expect(labels).toContain('app.ts'); // dependent reached via effect-link expansion
  });
});

describe('symbolic retriever', () => {
  it('ranks an exact symbol match above a prefix match', async () => {
    const retriever = createSymbolicRetriever({ graphStore: await buildGraph() });

    const candidates = await retriever.retrieve({ text: 'parseQuery' });
    expect(candidates[0]?.label).toBe('parseQuery'); // exact (score 1)
    expect(candidates.map((c) => c.label)).toContain('parseQueryHelper'); // prefix (score 0.5)
    expect(candidates[0]?.score).toBeGreaterThan(candidates[1]?.score ?? 0);
  });
});
