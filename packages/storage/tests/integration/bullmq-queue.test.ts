import { Queue as BullQueue } from 'bullmq';
import { describe, expect, it } from 'vitest';
import { createBullMqQueue } from '../../src/adapters/bullmq-queue/index';
import { runQueueConformance } from '../conformance/queue.conformance';

/**
 * The BullMQ adapter against a **real Redis** (docker-compose), because everything this adapter is for
 * — retry accounting, in-flight draining, at-least-once delivery — lives in the broker, not in our
 * code. A mocked Redis would only assert that we call the library we call.
 *
 *   docker compose up -d redis
 *   TESSERA_TEST_REDIS=1 pnpm --filter @tessera/storage test
 */
const enabled = process.env['TESSERA_TEST_REDIS'] === '1';
const REDIS_URL = process.env['TESSERA_REDIS_URL'] ?? 'redis://127.0.0.1:6379';

let run = 0;

describe.skipIf(!enabled)('bullmq queue against Redis (TESSERA_TEST_REDIS=1)', () => {
  runQueueConformance('bullmq', (options) => {
    // A per-case key prefix: BullMQ workers are long-polling consumers, so two cases sharing a
    // namespace would steal each other's jobs and fail in ways that look like adapter bugs.
    run += 1;
    const prefix = `{tessera-test-${Date.now().toString(36)}-${run}}`;
    const queue = createBullMqQueue({
      connection: REDIS_URL,
      prefix,
      ...(options?.maxAttempts === undefined ? {} : { maxAttempts: options.maxAttempts }),
    });

    return {
      queue,
      /**
       * Wait for the queue to go **quiescent**, not for it to empty.
       *
       * Delivery is asynchronous — `enqueue` writes to Redis and a separate worker picks the job up —
       * so without a barrier `shutdown()` would close the worker before it ever ran, and the suite
       * would be asserting synchronous delivery, which the port does not promise.
       *
       * But "wait until nothing is pending" is the wrong barrier: the unsubscribed-handler case
       * enqueues a job that, correctly, nobody will ever consume. Quiescence covers both — settled
       * when nothing is left to do, **or** when nothing is being worked and the backlog has stopped
       * changing (no consumer). Progress, not emptiness, is what "delivery finished" really means.
       */
      settle: async () => {
        const deadline = Date.now() + 15_000;
        let idle = 0;
        let stable = 0;
        let previous = -1;

        while (Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          const { waiting, active } = await counts(prefix);

          // Two consecutive clean reads: a job claimed but not yet counted active reads as idle for
          // an instant, so one is not enough.
          idle = waiting === 0 && active === 0 ? idle + 1 : 0;
          if (idle >= 2) return;

          stable = active === 0 && waiting === previous ? stable + 1 : 0;
          previous = waiting;
          if (stable >= 6) return; // ~300ms of a backlog nobody is consuming
        }
        throw new Error('queue did not reach a quiescent state within 15s');
      },
    };
  });

  /** Jobs queued vs. being worked on the `jobs` topic, read straight from Redis. */
  async function counts(prefix: string): Promise<{ waiting: number; active: number }> {
    const inspector = new BullQueue('jobs', {
      connection: { url: REDIS_URL } as never,
      prefix,
    });
    try {
      const raw = await inspector.getJobCounts('waiting', 'active', 'delayed', 'paused');
      return {
        waiting: (raw['waiting'] ?? 0) + (raw['delayed'] ?? 0) + (raw['paused'] ?? 0),
        active: raw['active'] ?? 0,
      };
    } finally {
      await inspector.close();
    }
  }

  it('does not implement drain() — a distributed queue cannot honestly promise it', async () => {
    // Documented in the port as optional, and the absence is load-bearing: a drain() that waited only
    // for THIS process's workers would mean something different per deployment profile.
    const queue = createBullMqQueue({ connection: REDIS_URL, prefix: '{tessera-test-drain}' });
    try {
      expect(queue.drain).toBeUndefined();
    } finally {
      await queue.shutdown();
    }
  });

  it('refuses to enqueue after shutdown', async () => {
    const queue = createBullMqQueue({ connection: REDIS_URL, prefix: '{tessera-test-closed}' });
    await queue.shutdown();
    await expect(queue.enqueue('jobs', { x: 1 })).rejects.toThrow(/shut down/);
  });
});
