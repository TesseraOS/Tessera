import { describe, expect, it } from 'vitest';
import type { Queue } from '../../src/ports/queue';

export interface QueueFactoryOptions {
  maxAttempts?: number;
}

export interface QueueHarness {
  readonly queue: Queue;
  /**
   * Wait until work enqueued so far has been delivered.
   *
   * **This hook exists because the contract does not promise synchronous delivery.** The in-process
   * adapter dispatches on the microtask queue, so `enqueue` → `shutdown()` happens to observe the
   * result and it needs no `settle`. A distributed adapter writes to a broker and a separate worker
   * picks the job up later, so the same sequence would close the worker before it ever ran — the
   * assertion would fail against a perfectly correct adapter.
   *
   * Without this the suite would be quietly testing "delivery is synchronous", which is a property of
   * one implementation rather than of the port.
   */
  readonly settle?: () => Promise<void>;
  /** Release adapter resources (connections, keys) after the case. */
  readonly cleanup?: () => Promise<void>;
}

/** Builds a fresh Queue for each test; options let a case configure retry behavior. */
export type QueueFactory = (options?: QueueFactoryOptions) => QueueHarness | Promise<QueueHarness>;

/**
 * The behavioral contract every {@link Queue} adapter must satisfy. Each adapter runs this
 * from its own `tests/integration` file (ADR-0003 conformance suite, ADR-0014 layout).
 */
export function runQueueConformance(name: string, makeQueue: QueueFactory): void {
  describe(`Queue conformance: ${name}`, () => {
    it('delivers an enqueued payload to a subscriber', async () => {
      const { queue, settle, cleanup } = await makeQueue();
      try {
        let received: number | undefined;
        queue.subscribe<{ n: number }>('jobs', (payload) => {
          received = payload.n;
        });
        await queue.enqueue('jobs', { n: 42 });
        await settle?.();
        await queue.shutdown();
        expect(received).toBe(42);
      } finally {
        await cleanup?.();
      }
    });

    it('retries a failing handler up to maxAttempts', async () => {
      const { queue, settle, cleanup } = await makeQueue({ maxAttempts: 3 });
      try {
        let attempts = 0;
        queue.subscribe('jobs', () => {
          attempts += 1;
          if (attempts < 3) throw new Error('transient failure');
        });
        await queue.enqueue('jobs', { x: 1 });
        await settle?.();
        await queue.shutdown();
        expect(attempts).toBe(3);
      } finally {
        await cleanup?.();
      }
    });

    it('stops delivering to an unsubscribed handler', async () => {
      const { queue, settle, cleanup } = await makeQueue();
      try {
        let count = 0;
        const subscription = queue.subscribe('jobs', () => {
          count += 1;
        });
        subscription.unsubscribe();
        await queue.enqueue('jobs', {});
        await settle?.();
        await queue.shutdown();
        expect(count).toBe(0);
      } finally {
        await cleanup?.();
      }
    });

    it('drains in-flight async work on shutdown', async () => {
      const { queue, settle, cleanup } = await makeQueue();
      try {
        let done = false;
        queue.subscribe('jobs', async () => {
          await Promise.resolve();
          done = true;
        });
        await queue.enqueue('jobs', {});
        await settle?.();
        await queue.shutdown();
        expect(done).toBe(true);
      } finally {
        await cleanup?.();
      }
    });
  });
}
