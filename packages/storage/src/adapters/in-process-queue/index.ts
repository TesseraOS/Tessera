import { InternalError } from '@tessera/core';
import type { JobHandler, Queue, QueueSubscription } from '../../ports/queue.js';

export interface InProcessQueueOptions {
  /** Max delivery attempts per job before giving up (default 1, i.e. no retry). */
  readonly maxAttempts?: number;
}

/**
 * In-process job queue (the local default). Delivers enqueued payloads to a topic's
 * subscribers on the microtask queue, retrying a failing handler up to `maxAttempts`.
 * `shutdown()` stops accepting new jobs and drains in-flight work. A Redis/BullMQ adapter
 * implements the same {@link Queue} contract for cloud (ADR-0003).
 */
export function createInProcessQueue(options: InProcessQueueOptions = {}): Queue {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 1);
  const subscribers = new Map<string, Set<JobHandler<unknown>>>();
  const inFlight = new Set<Promise<unknown>>();
  let accepting = true;

  async function deliver(handler: JobHandler<unknown>, payload: unknown): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await handler(payload);
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  return {
    enqueue(topic, payload) {
      if (!accepting) {
        return Promise.reject(new InternalError('queue is shut down'));
      }
      const subs = subscribers.get(topic);
      if (subs !== undefined) {
        for (const handler of subs) {
          // Swallow failures after retries are exhausted so one bad job can't reject enqueue;
          // a production adapter would route to a dead-letter queue here.
          const job = deliver(handler, payload).catch(() => undefined);
          inFlight.add(job);
          void job.finally(() => {
            inFlight.delete(job);
          });
        }
      }
      return Promise.resolve();
    },

    subscribe(topic, handler) {
      let set = subscribers.get(topic);
      if (set === undefined) {
        set = new Set();
        subscribers.set(topic, set);
      }
      set.add(handler as JobHandler<unknown>);
      const subscription: QueueSubscription = {
        unsubscribe() {
          subscribers.get(topic)?.delete(handler as JobHandler<unknown>);
        },
      };
      return subscription;
    },

    async shutdown() {
      accepting = false;
      await Promise.all([...inFlight]);
    },
  };
}
