import { createInMemoryMemoryStore } from '../../src/adapters/in-memory-memory-store';
import { runMemoryStoreConformance } from '../conformance/memory-store.conformance';

// The in-memory MemoryStore adapter must satisfy the shared contract.
runMemoryStoreConformance('in-memory', () =>
  Promise.resolve({ store: createInMemoryMemoryStore() }),
);
