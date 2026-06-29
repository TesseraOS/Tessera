import { describe, expect, it } from 'vitest';
import { ValidationError } from '@tessera/core';
import { createFakeEmbeddings } from '@tessera/ai';
import { createSqliteStore, createSqliteVecStore } from '@tessera/storage';
import { createSemanticRetriever } from '../../src/adapters/semantic-retriever';
import { createKeywordRetriever } from '../../src/adapters/keyword-retriever';
import { createHybridRetriever } from '../../src/service/hybrid-retriever';

const DIMENSION = 16;

// Semantic + keyword retrievers sharing one ref space so fusion can combine their signals.
async function setup() {
  const embeddings = createFakeEmbeddings({ dimension: DIMENSION });
  const vectorStore = createSqliteVecStore({ path: ':memory:', dimension: DIMENSION });
  const sqlite = createSqliteStore({ path: ':memory:' });
  const keyword = createKeywordRetriever({ db: sqlite.db });

  for (const [ref, text] of [
    ['doc:auth', 'login auth oauth tokens'],
    ['doc:db', 'database drizzle migrations'],
  ] as const) {
    await vectorStore.upsert([
      { id: ref, vector: await embeddings.embed(text), model: embeddings.info.model },
    ]);
    keyword.index(ref, text);
  }

  const semantic = createSemanticRetriever({ embeddings, vectorStore });
  const cleanup = async () => {
    await vectorStore.close();
    await sqlite.close();
  };
  return { semantic, keyword, cleanup };
}

describe('hybrid retriever', () => {
  it('fuses signals so an item matched by two retrievers ranks first, with attribution', async () => {
    const { semantic, keyword, cleanup } = await setup();
    try {
      const results = await createHybridRetriever([semantic, keyword]).search({
        text: 'login auth oauth',
      });

      expect(results[0]?.ref).toBe('doc:auth');
      expect(results[0]?.signals.map((signal) => signal.signal).sort()).toEqual([
        'keyword',
        'semantic',
      ]);
    } finally {
      await cleanup();
    }
  });

  it('honors per-signal weights', async () => {
    const { semantic, keyword, cleanup } = await setup();
    try {
      // With only keyword weighted, the keyword-best document leads.
      const results = await createHybridRetriever([semantic, keyword], {
        weights: { semantic: 0 },
      }).search({ text: 'drizzle migrations' });

      expect(results[0]?.ref).toBe('doc:db');
      expect(results.every((r) => r.signals.every((s) => s.signal === 'keyword'))).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it('rejects an empty query with a ValidationError', async () => {
    const { semantic, keyword, cleanup } = await setup();
    try {
      await expect(
        createHybridRetriever([semantic, keyword]).search({ text: '' }),
      ).rejects.toBeInstanceOf(ValidationError);
    } finally {
      await cleanup();
    }
  });
});
