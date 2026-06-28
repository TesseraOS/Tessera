import { describe, expect, it } from 'vitest';
import type { VectorMetric, VectorStore } from '../../src/ports/vector';

export interface VectorHarness {
  store: VectorStore;
  cleanup: () => Promise<void>;
}

export interface VectorConfig {
  dimension: number;
  metric?: VectorMetric;
}

/** Builds a fresh VectorStore (isolated index) per test. */
export type VectorFactory = (config: VectorConfig) => Promise<VectorHarness>;

/** The behavioral contract every {@link VectorStore} adapter must satisfy (ADR-0003/0006). */
export function runVectorConformance(name: string, makeStore: VectorFactory): void {
  describe(`VectorStore conformance: ${name}`, () => {
    it('upsert then query returns nearest first, with distance and model', async () => {
      const { store, cleanup } = await makeStore({ dimension: 3 });
      try {
        await store.upsert([
          { id: 'a', vector: [1, 0, 0], model: 'm1' },
          { id: 'b', vector: [0, 1, 0], model: 'm1' },
          { id: 'c', vector: [0.9, 0.1, 0], model: 'm1' },
        ]);
        const matches = await store.query([1, 0, 0], 2);
        expect(matches).toHaveLength(2);
        expect(matches[0]?.id).toBe('a');
        expect(matches[0]?.distance).toBeCloseTo(0);
        expect(matches[0]?.model).toBe('m1');
        expect(matches[1]?.id).toBe('c');
      } finally {
        await cleanup();
      }
    });

    it('respects k', async () => {
      const { store, cleanup } = await makeStore({ dimension: 3 });
      try {
        await store.upsert([
          { id: 'a', vector: [1, 0, 0], model: 'm1' },
          { id: 'b', vector: [0, 1, 0], model: 'm1' },
        ]);
        expect(await store.query([1, 0, 0], 1)).toHaveLength(1);
      } finally {
        await cleanup();
      }
    });

    it('upsert replaces an existing id', async () => {
      const { store, cleanup } = await makeStore({ dimension: 3 });
      try {
        await store.upsert([{ id: 'a', vector: [1, 0, 0], model: 'm1' }]);
        await store.upsert([{ id: 'a', vector: [0, 1, 0], model: 'm2' }]);
        const matches = await store.query([0, 1, 0], 1);
        expect(matches).toHaveLength(1);
        expect(matches[0]?.id).toBe('a');
        expect(matches[0]?.distance).toBeCloseTo(0);
        expect(matches[0]?.model).toBe('m2');
      } finally {
        await cleanup();
      }
    });

    it('delete removes vectors', async () => {
      const { store, cleanup } = await makeStore({ dimension: 3 });
      try {
        await store.upsert([{ id: 'a', vector: [1, 0, 0], model: 'm1' }]);
        await store.delete(['a']);
        expect(await store.query([1, 0, 0], 5)).toHaveLength(0);
      } finally {
        await cleanup();
      }
    });

    it('rejects vectors whose length != dimension', async () => {
      const { store, cleanup } = await makeStore({ dimension: 3 });
      try {
        await expect(store.upsert([{ id: 'x', vector: [1, 2], model: 'm1' }])).rejects.toThrow();
      } finally {
        await cleanup();
      }
    });

    it('exposes capabilities', async () => {
      const { store, cleanup } = await makeStore({ dimension: 3 });
      try {
        expect(store.capabilities.dimension).toBe(3);
        expect(['l2', 'cosine']).toContain(store.capabilities.metric);
      } finally {
        await cleanup();
      }
    });
  });
}
