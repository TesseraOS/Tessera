import { createInMemorySourceRegistry } from './registry.js';
import { runSourceRegistryConformance } from './registry.conformance.js';

runSourceRegistryConformance('in-memory', () =>
  Promise.resolve({ registry: createInMemorySourceRegistry() }),
);
