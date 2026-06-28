import { createSqliteVecStore } from '../../src/adapters/sqlite-vec/index';
import { runVectorConformance } from '../conformance/vector.conformance';

// The sqlite-vec adapter must satisfy the shared VectorStore contract.
runVectorConformance('sqlite-vec', async ({ dimension, metric }) => {
  const store = createSqliteVecStore(
    metric === undefined
      ? { path: ':memory:', dimension }
      : { path: ':memory:', dimension, metric },
  );
  return { store, cleanup: () => store.close() };
});
