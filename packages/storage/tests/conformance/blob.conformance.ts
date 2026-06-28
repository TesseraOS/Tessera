import { describe, expect, it } from 'vitest';
import type { BlobStore } from '../../src/ports/blob';

export interface BlobHarness {
  store: BlobStore;
  cleanup: () => Promise<void>;
}

/** Builds a fresh BlobStore (with isolated backing storage) and a cleanup for each test. */
export type BlobFactory = () => Promise<BlobHarness>;

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const text = (data: Uint8Array | undefined): string | undefined =>
  data === undefined ? undefined : new TextDecoder().decode(data);

/** The behavioral contract every {@link BlobStore} adapter must satisfy (ADR-0003). */
export function runBlobConformance(name: string, makeStore: BlobFactory): void {
  describe(`BlobStore conformance: ${name}`, () => {
    it('put then get round-trips bytes', async () => {
      const { store, cleanup } = await makeStore();
      try {
        await store.put('a/b.txt', bytes('hello'));
        expect(text(await store.get('a/b.txt'))).toBe('hello');
      } finally {
        await cleanup();
      }
    });

    it('get returns undefined for a missing key', async () => {
      const { store, cleanup } = await makeStore();
      try {
        expect(await store.get('missing')).toBeUndefined();
      } finally {
        await cleanup();
      }
    });

    it('exists reflects presence, delete removes (and is safe when absent)', async () => {
      const { store, cleanup } = await makeStore();
      try {
        await store.delete('x'); // no error when absent
        expect(await store.exists('x')).toBe(false);
        await store.put('x', bytes('1'));
        expect(await store.exists('x')).toBe(true);
        await store.delete('x');
        expect(await store.exists('x')).toBe(false);
      } finally {
        await cleanup();
      }
    });

    it('list returns stored keys, filtered by prefix', async () => {
      const { store, cleanup } = await makeStore();
      try {
        await store.put('docs/a.txt', bytes('a'));
        await store.put('docs/b.txt', bytes('b'));
        await store.put('other/c.txt', bytes('c'));
        const all = await store.list();
        expect([...all].sort()).toEqual(['docs/a.txt', 'docs/b.txt', 'other/c.txt']);
        const docs = await store.list('docs/');
        expect([...docs].sort()).toEqual(['docs/a.txt', 'docs/b.txt']);
      } finally {
        await cleanup();
      }
    });

    it('rejects keys with traversal segments', async () => {
      const { store, cleanup } = await makeStore();
      try {
        await expect(store.put('../evil', bytes('x'))).rejects.toThrow();
      } finally {
        await cleanup();
      }
    });
  });
}
