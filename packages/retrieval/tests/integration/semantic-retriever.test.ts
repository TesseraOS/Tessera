import { describe, expect, it } from 'vitest';
import { createFakeEmbeddings } from '@tessera/ai';
import { createSqliteVecStore } from '@tessera/storage';
import { createSemanticRetriever } from '../../src/adapters/semantic-retriever';
import { runRetrieverConformance } from '../conformance/retriever.conformance';

const DIMENSION = 16;

async function setup() {
  const embeddings = createFakeEmbeddings({ dimension: DIMENSION });
  const vectorStore = createSqliteVecStore({ path: ':memory:', dimension: DIMENSION });
  for (const [ref, text] of [
    ['doc:hello', 'hello world'],
    ['doc:bye', 'goodbye moon'],
  ] as const) {
    await vectorStore.upsert([
      { id: ref, vector: await embeddings.embed(text), model: embeddings.info.model },
    ]);
  }
  return { embeddings, vectorStore };
}

runRetrieverConformance('semantic', 'semantic', async () => {
  const { embeddings, vectorStore } = await setup();
  return {
    retriever: createSemanticRetriever({ embeddings, vectorStore }),
    query: 'hello world',
    cleanup: () => vectorStore.close(),
  };
});

describe('semantic retriever', () => {
  it('ranks the document with identical text nearest', async () => {
    const { embeddings, vectorStore } = await setup();
    try {
      const candidates = await createSemanticRetriever({ embeddings, vectorStore }).retrieve({
        text: 'hello world',
      });
      expect(candidates[0]?.ref).toBe('doc:hello'); // same text → distance ~0 → nearest
    } finally {
      await vectorStore.close();
    }
  });
});
