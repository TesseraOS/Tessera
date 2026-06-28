/** Metadata about the embedding model backing an {@link Embeddings} instance. */
export interface EmbeddingModelInfo {
  /** Model identifier (recorded alongside vectors so they can be re-embedded — ADR-0006). */
  readonly model: string;
  /** Output vector dimension. */
  readonly dimension: number;
}

/**
 * Embeddings port (ADR-0006). The local default is Transformers.js (in-process, no keys);
 * Ollama and hosted providers implement the same contract. Backend is swappable.
 */
export interface Embeddings {
  readonly info: EmbeddingModelInfo;
  /** Embed a single text into a `dimension`-length vector. */
  embed(text: string): Promise<number[]>;
  /** Embed many texts; returns one vector per input, in order. */
  embedBatch(texts: readonly string[]): Promise<number[][]>;
}
