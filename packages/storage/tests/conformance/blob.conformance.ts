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

    it('rejects a BACKSLASH key on every adapter and every OS (F-075)', async () => {
      // The key space must not depend on the platform. `path.win32.join` treats `\` as a separator
      // and normalizes `..` across it, so `a\..\..\..\other` escapes the directory the caller named
      // on Windows while being an ordinary opaque name on POSIX and on S3. Once a caller-supplied
      // string could reach a key (GET /v1/fragments/:ref), that difference was a cross-tenant read.
      // Asserted in the SHARED suite so no adapter can be the lax one.
      const { store, cleanup } = await makeStore();
      try {
        await store.put('tenant/project/real', bytes('owned by this scope'));

        await expect(
          store.put(String.raw`tenant/project/a\..\..\escaped`, bytes('x')),
        ).rejects.toThrow();
        await expect(store.get(String.raw`tenant/project/a\..\..\..\other`)).rejects.toThrow();
        await expect(store.exists(String.raw`a\..\b`)).rejects.toThrow();
        await expect(store.delete(String.raw`tenant\..\..\real`)).rejects.toThrow();

        // Nothing escaped and nothing was destroyed by the attempts above.
        expect(text(await store.get('tenant/project/real'))).toBe('owned by this scope');
      } finally {
        await cleanup();
      }
    });
  });
}
