import { createInMemoryGraphStore, createKnowledgeGraphService } from '@tessera/knowledge-graph';
import { describe, expect, it } from 'vitest';
import { documentIdFor, type ProcessedDocument, type SourceDescriptor } from '../../src/domain';
import { createGraphExtractionSink } from '../../src/adapters/graph-extraction-sink';
import type { ExtractedGraph, SymbolExtractor } from '../../src/symbols/extractor';

const SOURCE: SourceDescriptor = { id: 'src-1', kind: 'filesystem', label: 'repo' };

function doc(path: string): ProcessedDocument {
  return {
    id: documentIdFor(SOURCE.id, path),
    source: SOURCE,
    path,
    kind: 'code',
    contentHash: `hash:${path}`,
    text: '',
    metadata: {},
    redactions: [],
  };
}

/** A deterministic extractor driven by a `path → ExtractedGraph` map (undefined = unsupported). */
function fakeExtractor(byPath: Map<string, ExtractedGraph>): SymbolExtractor {
  return { extract: (document) => Promise.resolve(byPath.get(document.path)) };
}

describe('createGraphExtractionSink', () => {
  it('populates file/symbol nodes + import edges so get_effects returns real dependents', async () => {
    const store = createInMemoryGraphStore();
    const graph = createKnowledgeGraphService(store);
    const files = new Map<string, ExtractedGraph>([
      ['src/a.ts', { symbols: [{ name: 'greet' }], imports: [{ specifier: './b' }] }],
      ['src/b.ts', { symbols: [{ name: 'helper' }], imports: [] }],
    ]);
    const sink = createGraphExtractionSink({ extractor: fakeExtractor(files), graph });

    await sink.upsert(doc('src/a.ts'));
    await sink.upsert(doc('src/b.ts'));

    // a imports b ⇒ changing b affects a: get_effects(b) returns a (with a path).
    const effects = await graph.getEffects({ kind: 'file', key: 'src/b' });
    expect(effects.map((hit) => hit.node.key)).toContain('src/a');

    // Symbol node was created (extensionless file key + '#name').
    expect(await store.getNodeByKey('symbol', 'src/a#greet')).toBeDefined();
    expect(await store.getNodeByKey('file', 'src/b')).toBeDefined();
  });

  it('skips unsupported documents (extractor returns undefined)', async () => {
    const store = createInMemoryGraphStore();
    const graph = createKnowledgeGraphService(store);
    const sink = createGraphExtractionSink({ extractor: fakeExtractor(new Map()), graph });

    await sink.upsert(doc('README.md'));
    expect(await store.listNodes()).toHaveLength(0);
  });

  it('is incremental: re-indexing a file with a removed import drops the stale effect-link', async () => {
    const store = createInMemoryGraphStore();
    const graph = createKnowledgeGraphService(store);
    const files = new Map<string, ExtractedGraph>([
      ['src/a.ts', { symbols: [], imports: [{ specifier: './b' }] }],
      ['src/b.ts', { symbols: [], imports: [] }],
    ]);
    const sink = createGraphExtractionSink({ extractor: fakeExtractor(files), graph });
    await sink.upsert(doc('src/a.ts'));
    await sink.upsert(doc('src/b.ts'));
    expect((await graph.getEffects({ kind: 'file', key: 'src/b' })).map((h) => h.node.key)).toEqual(
      ['src/a'],
    );

    // a no longer imports b → the stale a→b import + its derived effect-link are cleared.
    files.set('src/a.ts', { symbols: [], imports: [] });
    await sink.upsert(doc('src/a.ts'));
    expect(await graph.getEffects({ kind: 'file', key: 'src/b' })).toEqual([]);
  });

  it('removing a file clears its outgoing edges (dependents of it are re-derived)', async () => {
    const store = createInMemoryGraphStore();
    const graph = createKnowledgeGraphService(store);
    const files = new Map<string, ExtractedGraph>([
      ['src/a.ts', { symbols: [], imports: [{ specifier: './b' }] }],
      ['src/b.ts', { symbols: [], imports: [{ specifier: './c' }] }],
    ]);
    const sink = createGraphExtractionSink({ extractor: fakeExtractor(files), graph });
    await sink.upsert(doc('src/a.ts'));
    await sink.upsert(doc('src/b.ts'));

    // b imports c; a imports b. Remove b → b's outgoing import (b→c) is gone, so c has no dependents;
    // a still imports b (its edge preserved), so get_effects(b) still surfaces a.
    await sink.remove({ sourceId: SOURCE.id, path: 'src/b.ts' });
    expect(await graph.getEffects({ kind: 'file', key: 'src/c' })).toEqual([]);
    expect((await graph.getEffects({ kind: 'file', key: 'src/b' })).map((h) => h.node.key)).toEqual(
      ['src/a'],
    );
  });
});
