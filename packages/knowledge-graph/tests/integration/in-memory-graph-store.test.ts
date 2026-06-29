import { createInMemoryGraphStore } from '../../src/adapters/in-memory-graph-store';
import { runGraphStoreConformance } from '../conformance/graph-store.conformance';

// The in-memory GraphStore adapter must satisfy the shared contract.
runGraphStoreConformance('in-memory', () => Promise.resolve({ store: createInMemoryGraphStore() }));
