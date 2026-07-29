import type { BlobStore } from '@tessera/storage';
import { describe, expect, it } from 'vitest';
import { migrateCorpusToScopedKeys } from './corpus-migration.js';

const MARKER = '_tessera/migrations/corpus-scope-keys.json';
const SCOPE = { tenantId: 'acme', projectId: 'default' };

function memoryBlob(seed: Record<string, string> = {}): BlobStore {
  const store = new Map<string, Uint8Array>(
    Object.entries(seed).map(([key, text]) => [key, new TextEncoder().encode(text)]),
  );
  return {
    put(key, data) {
      store.set(key, data);
      return Promise.resolve();
    },
    get(key) {
      return Promise.resolve(store.get(key));
    },
    delete(key) {
      store.delete(key);
      return Promise.resolve();
    },
    exists(key) {
      return Promise.resolve(store.has(key));
    },
    list(prefix) {
      return Promise.resolve(
        [...store.keys()].filter((key) => prefix === undefined || key.startsWith(prefix)),
      );
    },
  };
}

const corpusOf = async (blob: BlobStore): Promise<readonly string[]> =>
  [...(await blob.list())].filter((key) => key !== MARKER).sort();

describe('migrateCorpusToScopedKeys', () => {
  it('moves every unprefixed key under the target scope, preserving bytes', async () => {
    const blob = memoryBlob({ ref1: 'first body', 'memory/lineage-1': 'a memory body' });

    const result = await migrateCorpusToScopedKeys(blob, SCOPE);

    expect(result).toEqual({ moved: 2, skipped: false });
    expect(await corpusOf(blob)).toEqual(['acme/default/memory/lineage-1', 'acme/default/ref1']);
    expect(new TextDecoder().decode(await blob.get('acme/default/ref1'))).toBe('first body');
  });

  it('is a no-op on the second run — the marker, not a re-scan', async () => {
    const blob = memoryBlob({ ref1: 'body' });
    await migrateCorpusToScopedKeys(blob, SCOPE);

    // A second pass over an already-migrated corpus must not re-prefix it into
    // `acme/default/acme/default/ref1`.
    const again = await migrateCorpusToScopedKeys(blob, SCOPE);

    expect(again).toEqual({ moved: 0, skipped: true });
    expect(await corpusOf(blob)).toEqual(['acme/default/ref1']);
  });

  it('skips keys already under the target prefix — the marker is data, not a cache', async () => {
    // Simulates an operator deleting the marker and rebooting: the pass runs again and must still
    // leave a migrated corpus alone.
    const blob = memoryBlob({ 'acme/default/ref1': 'body', ref2: 'other' });

    const result = await migrateCorpusToScopedKeys(blob, SCOPE);

    expect(result.moved).toBe(1);
    expect(await corpusOf(blob)).toEqual(['acme/default/ref1', 'acme/default/ref2']);
  });

  it('leaves the reserved _tessera/ namespace alone', async () => {
    const blob = memoryBlob({ '_tessera/something': 'internal', ref1: 'body' });

    await migrateCorpusToScopedKeys(blob, SCOPE);

    expect(await blob.exists('_tessera/something')).toBe(true);
    expect(await corpusOf(blob)).toEqual(['_tessera/something', 'acme/default/ref1']);
  });

  it('survives a key that vanishes mid-pass (a concurrent replica got there first)', async () => {
    const blob = memoryBlob({ ref1: 'body', ref2: 'body2' });
    const inner = blob.get.bind(blob);
    // `ref1` disappears between the listing and the read — exactly what a second replica causes.
    const racing: BlobStore = {
      ...blob,
      get: (key) => (key === 'ref1' ? Promise.resolve(undefined) : inner(key)),
    };

    const result = await migrateCorpusToScopedKeys(racing, SCOPE);

    expect(result.moved).toBe(1);
    expect(await corpusOf(blob)).toEqual(['acme/default/ref2', 'ref1']);
  });

  it('an empty corpus still records the marker, so it is checked once and never re-listed', async () => {
    const blob = memoryBlob();

    expect(await migrateCorpusToScopedKeys(blob, SCOPE)).toEqual({ moved: 0, skipped: false });
    expect(await blob.exists(MARKER)).toBe(true);
    expect(await migrateCorpusToScopedKeys(blob, SCOPE)).toEqual({ moved: 0, skipped: true });
  });

  it('refuses an illegal tenant id rather than writing into another namespace', async () => {
    const blob = memoryBlob({ ref1: 'body' });

    await expect(
      migrateCorpusToScopedKeys(blob, { tenantId: 'acme/x', projectId: 'default' }),
    ).rejects.toThrow(/tenantId/);
  });
});
