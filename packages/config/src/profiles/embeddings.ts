import {
  createFakeEmbeddings,
  createOllamaEmbeddings,
  createTransformersEmbeddings,
  createWorkerPoolEmbeddings,
  type Embeddings,
} from '@tessera/ai';
import { ValidationError } from '@tessera/core';
import type { TesseraConfig } from '../schema.js';

/**
 * Construct the configured embeddings provider. Transformers/Ollama load a model (async).
 *
 * Profile-independent: the embedding provider is chosen by `config.embeddings`, not by the deployment
 * profile — a self-hosted deployment runs the same Transformers.js pool a local one does.
 */
export async function createEmbeddings(config: TesseraConfig['embeddings']): Promise<Embeddings> {
  switch (config.provider) {
    case 'fake':
      return createFakeEmbeddings(
        config.dimension !== undefined ? { dimension: config.dimension } : {},
      );
    case 'ollama':
      if (config.model === undefined) {
        throw new ValidationError('embeddings.model is required for the "ollama" provider');
      }
      return createOllamaEmbeddings({
        model: config.model,
        ...(config.ollamaUrl !== undefined ? { baseUrl: config.ollamaUrl } : {}),
      });
    case 'transformers':
    default: {
      const model = config.model !== undefined ? { model: config.model } : {};
      // `workers > 0` runs Transformers.js on a worker-thread pool (F-085): embedding holds the main
      // thread (measured — 32.9ms mean loop delay, vs a 36.1ms on-thread control), so a scan stalls
      // every concurrent request without this. `0` keeps it in-process. The pool degrades to
      // in-process on its own if worker_threads is unavailable, so this stays safe by default.
      if (config.workers > 0) {
        return createWorkerPoolEmbeddings({ ...model, workers: config.workers });
      }
      return createTransformersEmbeddings(model);
    }
  }
}
