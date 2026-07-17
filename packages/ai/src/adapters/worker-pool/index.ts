import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import type { Embeddings, EmbeddingModelInfo } from '../../ports/embeddings.js';
import { createTransformersEmbeddings } from '../transformers/index.js';

/**
 * Worker-thread pool for embeddings (F-085) — the same {@link Embeddings} port, run off the
 * request-serving thread.
 *
 * **Why this exists, measured not assumed.** `@huggingface/transformers` runs ONNX through
 * `onnxruntime-node`, whose async `run()` is widely *assumed* to offload to libuv's threadpool. It
 * does not: calibrated against both hypotheses in the real shape of the work, embedding's mean
 * event-loop delay was 32.9ms — next to a 36.1ms known-on-thread control and a 16.7ms offloaded one.
 * So in-process embedding stalls every concurrent request for ~36ms per chunk while a scan runs.
 * Moving it to a worker gives the main thread back.
 *
 * **The pool is per-job, and that is where the concurrency comes from.** Each `embed` is one job
 * dispatched to an idle worker; the ingestion pipeline processes change events concurrently, so
 * several `embed` calls are in flight at once and naturally spread across workers. `embedBatch` fans
 * out the same way and reassembles in input order.
 *
 * **A worker cannot share the model** (~3s load, ~90MB resident each), so N workers = N copies. The
 * default is therefore **1** — which already moves 100% of embedding off the main thread, the whole
 * point — and costs nothing in throughput, since the in-process adapter embeds serially anyway. Raise
 * it to make scans faster; it does not make the API more available.
 *
 * **Not multi-process.** This makes the work leave the main thread; it does not make the API
 * multi-process (the event bus and scan-status map are in-process — that is F-056's problem).
 */

/** Messages the {@link EmbedWorkerHandle} sends back. Mirrors `worker/embed-worker.mjs`. */
type WorkerMessage =
  | { readonly type: 'ready'; readonly model: string; readonly dimension: number }
  | { readonly type: 'init-error'; readonly message: string }
  | { readonly type: 'result'; readonly id: number; readonly vectors: number[][] }
  | { readonly type: 'error'; readonly id: number; readonly message: string };

/**
 * The slice of `node:worker_threads` {@link Worker} the pool uses — narrowed to an interface so a
 * test can substitute a fake without a real thread or a 90MB model download.
 */
export interface EmbedWorkerHandle {
  postMessage(message: { readonly id: number; readonly texts: readonly string[] }): void;
  on(event: 'message', handler: (message: WorkerMessage) => void): void;
  on(event: 'error', handler: (error: Error) => void): void;
  terminate(): void | Promise<number>;
}

export interface WorkerPoolEmbeddingsOptions {
  /** HuggingFace/ONNX model id — must match the in-process adapter so vectors are interchangeable. */
  readonly model?: string;
  /** Worker threads to spawn (default 1). Each loads its own model copy — do not set this to `cpus`. */
  readonly workers?: number;
  /** Spawn a worker. Injectable for tests; defaults to the real embed-worker thread. */
  readonly spawn?: (model: string) => EmbedWorkerHandle;
  /**
   * In-process fallback, used when the pool cannot start (worker_threads or the native module
   * unavailable). Injectable so the degrade path is testable without loading a real model; defaults
   * to the Transformers.js adapter.
   */
  readonly fallback?: (model: string) => Promise<Embeddings>;
  /** Where a spawn/init failure is reported. Defaults to `console.warn`. */
  readonly onFallback?: (reason: string) => void;
}

const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2';

/** Resolve the worker entry. `src/` and `dist/` are the same depth under the package root, so this
 *  relative path resolves to the one `worker/embed-worker.mjs` from both — see the worker's header. */
function defaultSpawn(model: string): EmbedWorkerHandle {
  const url = new URL('../../../worker/embed-worker.mjs', import.meta.url);
  return new Worker(fileURLToPath(url), { workerData: { model } });
}

interface Job {
  readonly text: string;
  readonly resolve: (vector: number[]) => void;
  readonly reject: (error: Error) => void;
}

interface PoolWorker {
  readonly handle: EmbedWorkerHandle;
  current: Job | undefined;
}

/**
 * Create the pool. **Async**, like the in-process adapter: it spawns the workers and waits for each
 * to load its model and report its dimension. If any worker fails to start it degrades to the
 * in-process adapter rather than leaving the workspace unable to index at all.
 */
export async function createWorkerPoolEmbeddings(
  options: WorkerPoolEmbeddingsOptions = {},
): Promise<Embeddings> {
  const model = options.model ?? DEFAULT_MODEL;
  const count = Math.max(1, options.workers ?? 1);
  const spawn = options.spawn ?? defaultSpawn;
  const fallback = options.fallback ?? ((m) => createTransformersEmbeddings({ model: m }));
  const onFallback = options.onFallback ?? ((reason) => console.warn(`[embeddings] ${reason}`));

  const workers: PoolWorker[] = [];
  const queue: Job[] = [];
  let info: EmbeddingModelInfo | undefined;
  let jobId = 0;

  function dispatch(): void {
    for (const worker of workers) {
      if (worker.current !== undefined) continue;
      const job = queue.shift();
      if (job === undefined) return;
      worker.current = job;
      worker.handle.postMessage({ id: (jobId += 1), texts: [job.text] });
    }
  }

  /** Reject a worker's in-flight job and everything queued — used when a worker dies mid-run. */
  function failWorker(worker: PoolWorker, error: Error): void {
    const index = workers.indexOf(worker);
    if (index >= 0) workers.splice(index, 1);
    worker.current?.reject(error);
    worker.current = undefined;
    if (workers.length === 0) {
      // Nothing left to drain the queue — fail fast rather than hang a caller forever.
      while (queue.length > 0) queue.shift()!.reject(error);
    } else {
      dispatch();
    }
  }

  try {
    await Promise.all(
      Array.from({ length: count }, () => {
        const handle = spawn(model);
        const worker: PoolWorker = { handle, current: undefined };
        workers.push(worker);

        return new Promise<void>((resolve, reject) => {
          let initialized = false;
          handle.on('message', (message) => {
            switch (message.type) {
              case 'ready':
                initialized = true;
                info ??= { model: message.model, dimension: message.dimension };
                resolve();
                return;
              case 'init-error':
                reject(new Error(message.message));
                return;
              case 'result':
                worker.current?.resolve(message.vectors[0] ?? []);
                worker.current = undefined;
                dispatch();
                return;
              case 'error':
                worker.current?.reject(new Error(message.message));
                worker.current = undefined;
                dispatch();
                return;
            }
          });
          handle.on('error', (error) => {
            // A crash before `ready` fails init (rejecting here); after, it fails the running job.
            if (!initialized) reject(error);
            else failWorker(worker, error);
          });
        });
      }),
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    onFallback(`worker pool unavailable (${reason}); using in-process embeddings`);
    await Promise.all(workers.map((worker) => worker.handle.terminate()));
    return fallback(model);
  }

  const embedOne = (text: string): Promise<number[]> =>
    new Promise<number[]>((resolve, reject) => {
      queue.push({ text, resolve, reject });
      dispatch();
    });

  return {
    info: info ?? { model, dimension: 0 },
    embed: embedOne,
    // Order-preserving by construction: Promise.all resolves in array order regardless of which
    // worker finishes first, so the vectors line up with `texts` even under real concurrency.
    embedBatch: (texts) => Promise.all(texts.map(embedOne)),
    async close() {
      const dead = new Error('embeddings pool closed');
      while (queue.length > 0) queue.shift()!.reject(dead);
      await Promise.all(
        workers.map((worker) => {
          worker.current?.reject(dead);
          return worker.handle.terminate();
        }),
      );
      workers.length = 0;
    },
  };
}
