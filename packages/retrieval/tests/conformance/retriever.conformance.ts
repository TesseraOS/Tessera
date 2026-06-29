import { describe, expect, it } from 'vitest';
import type { RetrieverKind } from '../../src/domain';
import type { Retriever } from '../../src/ports/retriever';

export interface RetrieverHarness {
  retriever: Retriever;
  /** A query expected to match at least one indexed item. */
  query: string;
  cleanup?: () => Promise<void>;
}

export type RetrieverFactory = () => Promise<RetrieverHarness>;

/** Interface invariants every {@link Retriever} must satisfy, regardless of backend. */
export function runRetrieverConformance(
  name: string,
  kind: RetrieverKind,
  makeRetriever: RetrieverFactory,
): void {
  describe(`Retriever conformance: ${name}`, () => {
    it('tags every candidate with its own signal and orders them best-first', async () => {
      const { retriever, query, cleanup } = await makeRetriever();
      try {
        const candidates = await retriever.retrieve({ text: query });

        expect(retriever.kind).toBe(kind);
        expect(candidates.every((candidate) => candidate.signal === kind)).toBe(true);
        for (let i = 1; i < candidates.length; i += 1) {
          const previous = candidates[i - 1];
          const current = candidates[i];
          if (previous !== undefined && current !== undefined) {
            expect(previous.score).toBeGreaterThanOrEqual(current.score);
          }
        }
      } finally {
        await cleanup?.();
      }
    });

    it('respects the requested limit', async () => {
      const { retriever, query, cleanup } = await makeRetriever();
      try {
        expect((await retriever.retrieve({ text: query, limit: 1 })).length).toBeLessThanOrEqual(1);
      } finally {
        await cleanup?.();
      }
    });
  });
}
