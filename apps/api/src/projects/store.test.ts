import { createInMemoryProjectStore } from './store.js';
import { runProjectStoreConformance } from './store.conformance.js';

runProjectStoreConformance('in-memory', () =>
  Promise.resolve({ store: createInMemoryProjectStore() }),
);
