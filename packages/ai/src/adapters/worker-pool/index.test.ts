import { describe, expect, it, vi } from 'vitest';
import { createFakeEmbeddings } from '../fake/index.js';
import {
  createWorkerPoolEmbeddings,
  type EmbedWorkerHandle,
  type WorkerPoolEmbeddingsOptions,
} from './index.js';

/**
 * The pool is unit-tested against a FAKE worker (no real thread, no 90MB model download) — the real
 * embed-worker thread is exercised by the integration suite. `spawn` and `fallback` are injected for
 * exactly this reason: the degrade path and the concurrency behaviour must be provable offline.
 */

type Listener = (arg: unknown) => void;

interface FakeWorkerScript {
  /** How this worker announces itself: ready, or a failed init. */
  readonly init: { type: 'ready'; dimension: number } | { type: 'init-error'; message: string };
  /** Turn a request's texts into vectors; default is a deterministic length-based stub. */
  readonly embed?: (texts: readonly string[]) => number[][];
  /** Extra ms before answering each request — lets a test provoke out-of-order completion. */
  readonly delayMs?: number;
}

/** A controllable stand-in for the worker thread. Records termination so `close()` is testable. */
class FakeWorker implements EmbedWorkerHandle {
  static spawned: FakeWorker[] = [];
  terminated = false;
  private readonly messageListeners: Listener[] = [];

  constructor(private readonly script: FakeWorkerScript) {
    FakeWorker.spawned.push(this);
    // Announce init on the next tick, like a real worker loading a model.
    queueMicrotask(() => this.emit(this.script.init));
  }

  on(event: 'message' | 'error', handler: Listener): void {
    if (event === 'message') this.messageListeners.push(handler);
  }

  postMessage({ id, texts }: { id: number; texts: readonly string[] }): void {
    const vectors = (this.script.embed ?? ((t) => t.map((s) => [s.length])))(texts);
    const answer = () => this.emit({ type: 'result', id, vectors });
    if (this.script.delayMs) setTimeout(answer, this.script.delayMs);
    else queueMicrotask(answer);
  }

  terminate(): void {
    this.terminated = true;
  }

  private emit(message: unknown): void {
    for (const listener of this.messageListeners) listener(message);
  }
}

function poolWith(
  scripts: FakeWorkerScript[],
  extra: Partial<WorkerPoolEmbeddingsOptions> = {},
): Promise<ReturnType<typeof createFakeEmbeddings>> {
  FakeWorker.spawned = [];
  let next = 0;
  return createWorkerPoolEmbeddings({
    workers: scripts.length,
    spawn: () => new FakeWorker(scripts[next++]!),
    ...extra,
  });
}

const READY = (dimension = 3): FakeWorkerScript => ({ init: { type: 'ready', dimension } });

describe('createWorkerPoolEmbeddings', () => {
  it('reports the model info its workers announce', async () => {
    const pool = await poolWith([READY(384)]);
    expect(pool.info.dimension).toBe(384);
  });

  it('embeds a single text through a worker', async () => {
    const pool = await poolWith([
      { init: { type: 'ready', dimension: 1 }, embed: (t) => t.map((s) => [s.length]) },
    ]);
    expect(await pool.embed('abcd')).toEqual([4]);
  });

  it('preserves input order in embedBatch even when workers finish out of order', async () => {
    // Two workers with different latencies: the second text's worker answers first. Promise.all must
    // still line the vectors up with the inputs, not with completion order.
    const pool = await poolWith([
      { init: { type: 'ready', dimension: 1 }, embed: (t) => [[t[0]!.length]], delayMs: 40 },
      { init: { type: 'ready', dimension: 1 }, embed: (t) => [[t[0]!.length]], delayMs: 5 },
    ]);

    const vectors = await pool.embedBatch(['aaaa', 'bb']);
    expect(vectors).toEqual([[4], [2]]);
  });

  it('runs more jobs than workers by queueing — a job waits for an idle worker', async () => {
    const embed = vi.fn((t: readonly string[]) => t.map((s) => [s.length]));
    const pool = await poolWith([{ init: { type: 'ready', dimension: 1 }, embed, delayMs: 5 }]);

    // One worker, three concurrent calls: all three must resolve, in order, without loss.
    const vectors = await Promise.all([pool.embed('a'), pool.embed('bb'), pool.embed('ccc')]);
    expect(vectors).toEqual([[1], [2], [3]]);
    expect(embed).toHaveBeenCalledTimes(3);
  });

  it('degrades to the in-process fallback when a worker fails to initialise', async () => {
    const onFallback = vi.fn();
    // The reported failure mode: worker_threads or the native module unavailable. The pool must not
    // throw — a workspace that indexes slowly beats one that cannot index at all.
    const pool = await poolWith([{ init: { type: 'init-error', message: 'no worker_threads' } }], {
      fallback: () => Promise.resolve(createFakeEmbeddings({ dimension: 8 })),
      onFallback,
    });

    expect(onFallback).toHaveBeenCalledOnce();
    expect(pool.info.dimension).toBe(8); // the fallback's info, so it really fell back
    expect((await pool.embed('x')).length).toBe(8); // and it works
    // The one worker that was spawned before the failure is torn down, not leaked.
    expect(FakeWorker.spawned[0]?.terminated).toBe(true);
  });

  it('terminates every worker on close, so the process can exit', async () => {
    const pool = await poolWith([READY(), READY()]);
    await pool.close?.();
    expect(FakeWorker.spawned.every((w) => w.terminated)).toBe(true);
  });
});
