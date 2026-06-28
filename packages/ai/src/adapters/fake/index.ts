import type { Embeddings, EmbeddingModelInfo } from '../../ports/embeddings.js';

export interface FakeEmbeddingsOptions {
  /** Vector dimension (default 8). */
  readonly dimension?: number;
  /** Reported model id (default 'fake'). */
  readonly model?: string;
}

/**
 * Deterministic, dependency-free embeddings for fast/offline tests and for other packages to
 * depend on without downloading a model. Same text → same normalized vector (hash-seeded).
 * NOT semantically meaningful — never use for real retrieval.
 */
export function createFakeEmbeddings(options: FakeEmbeddingsOptions = {}): Embeddings {
  const dimension = options.dimension ?? 8;
  const info: EmbeddingModelInfo = { model: options.model ?? 'fake', dimension };

  const vec = (text: string): number[] => {
    // FNV-1a hash → seed an LCG → fill, then L2-normalize.
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    let state = hash >>> 0;
    const raw: number[] = [];
    let sumSquares = 0;
    for (let i = 0; i < dimension; i += 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const value = state / 0xffffffff - 0.5;
      raw.push(value);
      sumSquares += value * value;
    }
    const norm = Math.sqrt(sumSquares) || 1;
    return raw.map((value) => value / norm);
  };

  return {
    info,
    async embed(text) {
      return vec(text);
    },
    async embedBatch(texts) {
      return texts.map(vec);
    },
  };
}
