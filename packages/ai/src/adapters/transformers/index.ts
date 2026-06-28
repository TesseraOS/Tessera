import { pipeline } from '@huggingface/transformers';
import type { Embeddings, EmbeddingModelInfo } from '../../ports/embeddings.js';

export interface TransformersEmbeddingsOptions {
  /** HuggingFace/ONNX model id (default: a small all-MiniLM-L6-v2, 384-d). */
  readonly model?: string;
}

const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2';

/**
 * Local, in-process embeddings via Transformers.js — **zero external services or API keys**
 * (ADR-0006). The model is downloaded and cached on first use. Creation is async: it loads the
 * model and probes the output dimension. Mean-pooled + L2-normalized vectors.
 */
export async function createTransformersEmbeddings(
  options: TransformersEmbeddingsOptions = {},
): Promise<Embeddings> {
  const model = options.model ?? DEFAULT_MODEL;
  const extractor = await pipeline('feature-extraction', model);

  const embedOne = async (text: string): Promise<number[]> => {
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data as Float32Array);
  };

  // Probe once to learn the dimension.
  const probe = await embedOne('dimension probe');
  const info: EmbeddingModelInfo = { model, dimension: probe.length };

  return {
    info,
    embed: embedOne,
    async embedBatch(texts) {
      const results: number[][] = [];
      for (const text of texts) {
        results.push(await embedOne(text));
      }
      return results;
    },
  };
}
