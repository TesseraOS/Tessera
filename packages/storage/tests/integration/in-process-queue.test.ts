import { createInProcessQueue } from '../../src/adapters/in-process-queue/index';
import { runQueueConformance } from '../conformance/queue.conformance';

// The in-process Queue adapter must satisfy the shared Queue contract. No `settle` hook: delivery is
// dispatched on the microtask queue, so `shutdown()` alone already observes the work.
runQueueConformance('in-process', (options) => ({ queue: createInProcessQueue(options) }));
