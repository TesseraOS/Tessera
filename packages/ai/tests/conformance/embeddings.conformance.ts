import { describe, expect, it } from 'vitest';
import type { Embeddings } from '../../src/ports/embeddings';

/** Builds a ready Embeddings instance (model loaded / dimension known). */
export type EmbeddingsFactory = () => Promise<Embeddings>;

/** The behavioral contract every {@link Embeddings} adapter must satisfy (ADR-0006). */
export function runEmbeddingsConformance(name: string, make: EmbeddingsFactory): void {
  describe(`Embeddings conformance: ${name}`, () => {
    it('embed returns a finite vector of info.dimension', async () => {
      const embeddings = await make();
      const vector = await embeddings.embed('hello world');
      expect(vector).toHaveLength(embeddings.info.dimension);
      expect(vector.every((value) => Number.isFinite(value))).toBe(true);
    });

    it('is deterministic for the same input', async () => {
      const embeddings = await make();
      const a = await embeddings.embed('the same text');
      const b = await embeddings.embed('the same text');
      expect(a).toHaveLength(b.length);
      for (let i = 0; i < a.length; i += 1) {
        expect(a[i]).toBeCloseTo(b[i] ?? Number.NaN, 5);
      }
    });

    it('embedBatch returns one vector per input, each of info.dimension', async () => {
      const embeddings = await make();
      const vectors = await embeddings.embedBatch(['a', 'b', 'c']);
      expect(vectors).toHaveLength(3);
      for (const vector of vectors) {
        expect(vector).toHaveLength(embeddings.info.dimension);
      }
    });

    it('produces different vectors for clearly different inputs', async () => {
      const embeddings = await make();
      const a = await embeddings.embed('cat');
      const b = await embeddings.embed('a completely different sentence about databases');
      expect(a).not.toEqual(b);
    });
  });
}
