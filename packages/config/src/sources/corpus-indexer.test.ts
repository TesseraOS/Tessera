import { createFakeEmbeddings, type Embeddings } from '@tessera/ai';
import {
  createKeywordRetriever,
  createSemanticRetriever,
  createTemporalRetriever,
} from '@tessera/retrieval';
import { createSqliteStore, createSqliteVecStore, type BlobStore } from '@tessera/storage';
import { afterEach, describe, expect, it } from 'vitest';
import { createCorpusIndexer } from './corpus-indexer.js';

/** A trivial in-memory BlobStore for the test (put/get/delete over a Map). */
function memoryBlob(): BlobStore {
  const store = new Map<string, Uint8Array>();
  return {
    put(key, data) {
      store.set(key, data);
      return Promise.resolve();
    },
    get(key) {
      return Promise.resolve(store.get(key));
    },
    delete(key) {
      store.delete(key);
      return Promise.resolve();
    },
    exists(key) {
      return Promise.resolve(store.has(key));
    },
    list(prefix) {
      const keys = [...store.keys()].filter((k) => prefix === undefined || k.startsWith(prefix));
      return Promise.resolve(keys);
    },
  };
}

/** Wrap fake embeddings to count embed() calls (proves the NFR-12 content-hash cache). */
function countingEmbeddings(): { embeddings: Embeddings; count: () => number } {
  const base = createFakeEmbeddings({ dimension: 8 });
  let calls = 0;
  return {
    count: () => calls,
    embeddings: {
      info: base.info,
      embed(text) {
        calls += 1;
        return base.embed(text);
      },
      embedBatch(texts) {
        calls += texts.length;
        return base.embedBatch(texts);
      },
    },
  };
}

describe('createCorpusIndexer', () => {
  let store: ReturnType<typeof createSqliteStore> | undefined;
  let vector: ReturnType<typeof createSqliteVecStore> | undefined;

  afterEach(async () => {
    await vector?.close();
    await store?.close();
    store = undefined;
    vector = undefined;
  });

  function harness() {
    store = createSqliteStore({ path: ':memory:' });
    const { embeddings, count } = countingEmbeddings();
    vector = createSqliteVecStore({ path: ':memory:', dimension: embeddings.info.dimension });
    const blob = memoryBlob();
    const keyword = createKeywordRetriever({ db: store.db });
    const temporal = createTemporalRetriever({ db: store.db });
    const semantic = createSemanticRetriever({ embeddings, vectorStore: vector });
    const indexer = createCorpusIndexer({ blob, keyword, temporal, embeddings, vector });
    return { indexer, blob, keyword, temporal, semantic, count };
  }

  it('indexes a document into the corpus + all three signals', async () => {
    const { indexer, blob, keyword, temporal, semantic } = harness();
    await indexer.indexDocument({
      ref: 'doc:1',
      text: 'authentication uses signed tokens',
      kind: 'markdown',
    });

    expect(await blob.exists('doc:1')).toBe(true);
    expect((await keyword.retrieve({ text: 'authentication tokens' })).map((c) => c.ref)).toContain(
      'doc:1',
    );
    expect((await temporal.retrieve({ text: 'anything' })).map((c) => c.ref)).toContain('doc:1');
    expect(
      (await semantic.retrieve({ text: 'authentication uses signed tokens' })).map((c) => c.ref),
    ).toContain('doc:1');
  });

  it('never re-embeds unchanged (ref, text) but re-embeds on change (NFR-12)', async () => {
    const { indexer, count } = harness();
    await indexer.indexDocument({ ref: 'doc:1', text: 'hello world', kind: 'text' });
    expect(count()).toBe(1);

    // Identical (ref, text) → skipped, no re-embed.
    await indexer.indexDocument({ ref: 'doc:1', text: 'hello world', kind: 'text' });
    expect(count()).toBe(1);

    // Changed text → re-embed.
    await indexer.indexDocument({ ref: 'doc:1', text: 'hello there', kind: 'text' });
    expect(count()).toBe(2);
  });

  it('removeDocument clears the corpus + every index', async () => {
    const { indexer, blob, keyword, temporal, semantic } = harness();
    await indexer.indexDocument({ ref: 'doc:1', text: 'authentication tokens', kind: 'markdown' });
    await indexer.removeDocument({ ref: 'doc:1' });

    expect(await blob.exists('doc:1')).toBe(false);
    expect(
      (await keyword.retrieve({ text: 'authentication tokens' })).map((c) => c.ref),
    ).not.toContain('doc:1');
    expect((await temporal.retrieve({ text: 'x' })).map((c) => c.ref)).not.toContain('doc:1');
    expect(
      (await semantic.retrieve({ text: 'authentication tokens' })).map((c) => c.ref),
    ).not.toContain('doc:1');
  });

  it('isolates indexed content by tenant', async () => {
    const { indexer, keyword } = harness();
    await indexer.indexDocument({
      ref: 'doc:a',
      text: 'tenant a content',
      kind: 'text',
      tenantId: 'tenant-a',
    });

    expect(
      (await keyword.forTenant('tenant-a').retrieve({ text: 'content' })).map((c) => c.ref),
    ).toEqual(['doc:a']);
    expect(await keyword.forTenant('tenant-b').retrieve({ text: 'content' })).toEqual([]);
  });
});
