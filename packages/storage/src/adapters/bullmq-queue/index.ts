import { InternalError } from '@tessera/core';
import { Queue as BullQueue, Worker, type ConnectionOptions, type JobsOptions } from 'bullmq';
import type { JobHandler, Queue, QueueSubscription } from '../../ports/queue.js';

export interface BullMqQueueOptions {
  /** Redis connection — a URL string (`redis://host:6379`) or ioredis options. */
  readonly connection: string | ConnectionOptions;
  /** Max delivery attempts per job before it is failed (default 1, i.e. no retry). */
  readonly maxAttempts?: number;
  /**
   * Redis key namespace. Distinct prefixes give fully isolated queues on one Redis, which is how the
   * conformance suite keeps concurrent cases from consuming each other's jobs.
   */
  readonly prefix?: string;
  /** Backoff between retry attempts, ms (default 0 — retry immediately). */
  readonly backoffMs?: number;
}

/**
 * BullMQ/Redis {@link Queue} adapter for the self-hosted and cloud profiles (F-056, ADR-0059 §5).
 *
 * **Taken as a dependency rather than hand-rolled**, unlike the S3 signer next door. The asymmetry is
 * deliberate: SigV4 is a pure, fully-specified function with published test vectors, whereas a
 * reliable distributed queue is atomic Lua over Redis, visibility timeouts, stalled-job recovery and
 * retry accounting. Getting *that* subtly wrong loses jobs silently, and BullMQ is named in the
 * feature's own acceptance.
 *
 * One BullMQ queue and one worker per topic, created lazily. `drain()` is deliberately **not**
 * implemented — see below.
 */
export function createBullMqQueue(options: BullMqQueueOptions): Queue {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 1);
  const backoffMs = options.backoffMs ?? 0;

  // BullMQ requires `maxRetriesPerRequest: null` on a worker's connection; passing a URL string lets
  // it construct its own ioredis client with the right defaults.
  const connection: ConnectionOptions =
    typeof options.connection === 'string'
      ? ({ url: options.connection } as unknown as ConnectionOptions)
      : options.connection;

  const shared = {
    connection,
    ...(options.prefix === undefined ? {} : { prefix: options.prefix }),
  };

  const producers = new Map<string, BullQueue>();
  const workers = new Set<Worker>();
  let accepting = true;

  const jobOptions: JobsOptions = {
    attempts: maxAttempts,
    ...(backoffMs > 0 ? { backoff: { type: 'fixed', delay: backoffMs } } : {}),
    // Keep Redis clean: a completed job's payload is of no further use to us, and an unbounded
    // completed set is how a Redis instance quietly fills up.
    removeOnComplete: true,
    removeOnFail: true,
  };

  function producerFor(topic: string): BullQueue {
    let queue = producers.get(topic);
    if (queue === undefined) {
      queue = new BullQueue(topic, shared);
      producers.set(topic, queue);
    }
    return queue;
  }

  return {
    async enqueue(topic, payload) {
      if (!accepting) throw new InternalError('queue is shut down');
      await producerFor(topic).add(topic, payload, jobOptions);
    },

    subscribe<T>(topic: string, handler: JobHandler<T>): QueueSubscription {
      const worker = new Worker(
        topic,
        async (job) => {
          // A throw propagates to BullMQ, which is what drives the retry accounting — so the port's
          // "throwing triggers a retry" contract is honoured by doing nothing here.
          await handler(job.data as T);
        },
        shared,
      );
      // Without a listener BullMQ emits `error` on the worker as an unhandled event, which crashes the
      // process. Failures are already surfaced through job state; this just keeps them non-fatal.
      worker.on('error', () => {});
      workers.add(worker);

      return {
        unsubscribe() {
          workers.delete(worker);
          void worker.close();
        },
      };
    },

    async shutdown() {
      accepting = false;
      // Workers first: `close()` waits for the in-flight job to finish before resolving, which is the
      // port's "await all in-flight handlers".
      await Promise.all([...workers].map((worker) => worker.close()));
      workers.clear();
      await Promise.all([...producers.values()].map((queue) => queue.close()));
      producers.clear();
    },

    // `drain()` is intentionally ABSENT (the port documents it as optional). It would have to mean
    // "wait until every worker anywhere has finished", which a single process cannot know in a
    // distributed deployment — and a version that only waited for THIS process's workers would be a
    // barrier that silently means something different depending on the profile. Callers that need a
    // completion signal observe it through scan status / SSE, which is what F-071 already does.
  };
}
