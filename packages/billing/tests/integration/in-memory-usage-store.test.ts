import { createInMemoryUsageStore } from '../../src/usage/adapters/in-memory-usage-store';
import { runUsageStoreConformance } from '../conformance/usage-store.conformance';

// The in-memory UsageStore is the reference adapter — it must satisfy the shared contract it defines.
runUsageStoreConformance('in-memory', () => Promise.resolve({ store: createInMemoryUsageStore() }));
