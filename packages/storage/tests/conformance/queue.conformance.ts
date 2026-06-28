import { describe, expect, it } from 'vitest';
import type { Queue } from '../../src/ports/queue';

export interface QueueFactoryOptions {
  maxAttempts?: number;
}

/** Builds a fresh Queue for each test; options let a case configure retry behavior. */
export type QueueFactory = (options?: QueueFactoryOptions) => Queue;

/**
 * The behavioral contract every {@link Queue} adapter must satisfy. Each adapter runs this
 * from its own `tests/integration` file (ADR-0003 conformance suite, ADR-0014 layout).
 */
export function runQueueConformance(name: string, makeQueue: QueueFactory): void {
  describe(`Queue conformance: ${name}`, () => {
    it('delivers an enqueued payload to a subscriber', async () => {
      const queue = makeQueue();
      let received: number | undefined;
      queue.subscribe<{ n: number }>('jobs', (payload) => {
        received = payload.n;
      });
      await queue.enqueue('jobs', { n: 42 });
      await queue.shutdown();
      expect(received).toBe(42);
    });

    it('retries a failing handler up to maxAttempts', async () => {
      const queue = makeQueue({ maxAttempts: 3 });
      let attempts = 0;
      queue.subscribe('jobs', () => {
        attempts += 1;
        if (attempts < 3) throw new Error('transient failure');
      });
      await queue.enqueue('jobs', { x: 1 });
      await queue.shutdown();
      expect(attempts).toBe(3);
    });

    it('stops delivering to an unsubscribed handler', async () => {
      const queue = makeQueue();
      let count = 0;
      const subscription = queue.subscribe('jobs', () => {
        count += 1;
      });
      subscription.unsubscribe();
      await queue.enqueue('jobs', {});
      await queue.shutdown();
      expect(count).toBe(0);
    });

    it('drains in-flight async work on shutdown', async () => {
      const queue = makeQueue();
      let done = false;
      queue.subscribe('jobs', async () => {
        await Promise.resolve();
        done = true;
      });
      await queue.enqueue('jobs', {});
      await queue.shutdown();
      expect(done).toBe(true);
    });
  });
}
