import { createFakeEmbeddings } from '../../src/adapters/fake/index';
import { runEmbeddingsConformance } from '../conformance/embeddings.conformance';

// The deterministic fake adapter must satisfy the Embeddings contract (always runs; offline).
runEmbeddingsConformance('fake', async () => createFakeEmbeddings({ dimension: 16 }));
