import { describe } from 'vitest';
import { runEmbeddingsConformance } from '../conformance/embeddings.conformance';

// Guarded: downloads a model on first run. Enable with TESSERA_TEST_TRANSFORMERS=1.
// Dynamic import keeps Transformers.js (and onnxruntime) out of the default test run.
const enabled = process.env.TESSERA_TEST_TRANSFORMERS === '1';

describe.skipIf(!enabled)('transformers adapter (live)', () => {
  runEmbeddingsConformance('transformers', async () => {
    const { createTransformersEmbeddings } = await import('../../src/adapters/transformers/index');
    return createTransformersEmbeddings();
  });
});
