import { describe } from 'vitest';
import { runEmbeddingsConformance } from '../conformance/embeddings.conformance';

// Guarded: requires a running Ollama server. Enable with TESSERA_TEST_OLLAMA=1
// (optionally TESSERA_OLLAMA_MODEL, default 'nomic-embed-text').
const enabled = process.env.TESSERA_TEST_OLLAMA === '1';
const model = process.env.TESSERA_OLLAMA_MODEL ?? 'nomic-embed-text';

describe.skipIf(!enabled)('ollama adapter (live)', () => {
  runEmbeddingsConformance('ollama', async () => {
    const { createOllamaEmbeddings } = await import('../../src/adapters/ollama/index');
    return createOllamaEmbeddings({ model });
  });
});
