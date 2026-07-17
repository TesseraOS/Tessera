import { parentPort, workerData } from 'node:worker_threads';
import { pipeline } from '@huggingface/transformers';

/**
 * The embedding worker thread (F-085) — loads the model once, then embeds on request.
 *
 * **Why this file is plain `.mjs`, and why it lives outside `src/`.** The pool resolves it relative
 * to its own module URL. `src/` and `dist/` sit at the same depth under the package root, so
 * `../../../worker/embed-worker.mjs` resolves here identically whether the caller is the TypeScript
 * source (vitest) or the compiled output (production). Compiling it would break exactly one of those
 * two — `tsc` emits `worker.js` into `dist` only, so a test running from `src` would spawn a path
 * that does not exist. Keeping it uncompiled and out of the tree `tsc` owns sidesteps the copy step
 * and the divergence together.
 *
 * Protocol (deliberately tiny — everything crossing a thread boundary gets structured-cloned):
 *   worker → main : { type: 'ready', model, dimension } | { type: 'init-error', message }
 *   main → worker : { id, texts: string[] }
 *   worker → main : { type: 'result', id, vectors } | { type: 'error', id, message }
 */

const port = parentPort;
if (port === null) throw new Error('embed-worker must run as a worker thread');

const model = workerData?.model ?? 'Xenova/all-MiniLM-L6-v2';

let extractor;
try {
  extractor = await pipeline('feature-extraction', model);
  // Probe once to learn the dimension — the same handshake the in-process adapter does, so the two
  // report identical `info` and are genuinely swappable.
  const probe = await extractor('dimension probe', { pooling: 'mean', normalize: true });
  port.postMessage({ type: 'ready', model, dimension: probe.data.length });
} catch (error) {
  // Init failure is reported, not thrown: the pool degrades to in-process rather than leaving the
  // workspace unable to index at all.
  port.postMessage({
    type: 'init-error',
    message: error instanceof Error ? error.message : String(error),
  });
}

port.on('message', async ({ id, texts }) => {
  try {
    const vectors = [];
    for (const text of texts) {
      const output = await extractor(text, { pooling: 'mean', normalize: true });
      vectors.push(Array.from(output.data));
    }
    port.postMessage({ type: 'result', id, vectors });
  } catch (error) {
    port.postMessage({
      type: 'error',
      id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
