import { createInMemorySubscriptionStore } from '../../src/subscription-store';
import { runSubscriptionStoreConformance } from '../conformance/subscription-store.conformance';

// The in-memory SubscriptionStore is the reference adapter — it shipped with F-030 and, until now,
// with no test at all.
runSubscriptionStoreConformance('in-memory', () =>
  Promise.resolve({ store: createInMemorySubscriptionStore() }),
);
