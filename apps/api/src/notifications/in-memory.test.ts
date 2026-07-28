import { createInMemoryNotificationStore } from './in-memory.js';
import { runNotificationStoreConformance } from './notification-store.conformance.js';

runNotificationStoreConformance('in-memory', () =>
  Promise.resolve({ store: createInMemoryNotificationStore() }),
);
