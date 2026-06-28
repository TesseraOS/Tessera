import { createInProcessQueue } from '../../src/adapters/in-process-queue/index';
import { runQueueConformance } from '../conformance/queue.conformance';

// The in-process Queue adapter must satisfy the shared Queue contract.
runQueueConformance('in-process', (options) => createInProcessQueue(options));
