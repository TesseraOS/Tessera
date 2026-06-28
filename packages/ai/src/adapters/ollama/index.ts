import { TesseraError } from '@tessera/core';
import type { Embeddings, EmbeddingModelInfo } from '../../ports/embeddings.js';

export interface OllamaEmbeddingsOptions {
  /** Ollama model name, e.g. 'nomic-embed-text'. */
  readonly model: string;
  /** Base URL of the local Ollama server (default http://127.0.0.1:11434). */
  readonly baseUrl?: string;
}

interface OllamaEmbeddingResponse {
  embedding?: number[];
}

/**
 * Optional embeddings via a local **Ollama** server (ADR-0006). Requires a running daemon;
 * implements the same {@link Embeddings} contract. Creation probes the dimension once.
 */
export async function createOllamaEmbeddings(
  options: OllamaEmbeddingsOptions,
): Promise<Embeddings> {
  const baseUrl = options.baseUrl ?? 'http://127.0.0.1:11434';
  const { model } = options;

  const embedOne = async (text: string): Promise<number[]> => {
    const response = await fetch(`${baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
    });
    if (!response.ok) {
      throw new TesseraError(`Ollama embeddings request failed (${response.status})`);
    }
    const json = (await response.json()) as OllamaEmbeddingResponse;
    if (json.embedding === undefined) {
      throw new TesseraError('Ollama response missing "embedding"');
    }
    return json.embedding;
  };

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
