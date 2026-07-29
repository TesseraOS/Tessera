import { ValidationError } from '@tessera/core';
import type { BlobStore } from '@tessera/storage';
import { describe, expect, it } from 'vitest';
import {
  corpusKey,
  corpusScopeSegment,
  createBlobFragmentSource,
  DEFAULT_CORPUS_SCOPE,
  encodeDocument,
  putFragment,
  deleteFragment,
} from './fragment-source.js';

/** A trivial in-memory BlobStore (put/get/delete/exists/list over a Map). */
function memoryBlob(): BlobStore {
  const store = new Map<string, Uint8Array>();
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

const REF = 'a'.repeat(64);

describe('corpusKey', () => {
  it('composes {tenantId}/{projectId}/{ref}', () => {
    expect(corpusKey({ tenantId: 'acme', projectId: 'beta' }, REF)).toBe(`acme/beta/${REF}`);
  });

  it('rejects a scope segment that would escape its namespace', () => {
    // The whole point of the guard: `TenantId` is an unvalidated string off an OIDC claim, and
    // `acme/x` would otherwise write INTO acme's namespace.
    expect(() => corpusKey({ tenantId: 'acme/x', projectId: 'default' }, REF)).toThrow(
      ValidationError,
    );
  });

  it.each([['a/b'], ['..'], ['.'], [''], ['_tessera'], ['a'.repeat(65)]])(
    'corpusScopeSegment rejects %o',
    (value) => {
      expect(() => corpusScopeSegment(value, 'tenantId')).toThrow(ValidationError);
    },
  );

  it('accepts the ids deployments actually use', () => {
    for (const value of ['default', 'acme', 'acme-eu', 'tenant.1', 'a_b', 'A1']) {
      expect(corpusScopeSegment(value, 'tenantId')).toBe(value);
    }
  });
});

describe('createBlobFragmentSource', () => {
  it('round-trips a fragment, metadata included, within one scope', async () => {
    const blob = memoryBlob();
    const scope = { tenantId: 'acme', projectId: 'beta' };
    await putFragment(
      blob,
      { ref: REF, text: 'half-even rounding', kind: 'code', metadata: { path: 'src/x.ts' } },
      scope,
    );

    const source = createBlobFragmentSource(blob).forTenant('acme').forProject('beta');

    expect(await source.get(REF)).toEqual({
      ref: REF,
      text: 'half-even rounding',
      kind: 'code',
      metadata: { path: 'src/x.ts' },
    });
  });

  it('the base view is (default, default) — like every other store', async () => {
    const blob = memoryBlob();
    await putFragment(blob, { ref: REF, text: 'body', kind: 'code' }, DEFAULT_CORPUS_SCOPE);

    expect(await createBlobFragmentSource(blob).get(REF)).toMatchObject({ text: 'body' });
  });

  it('resolves NOTHING for another tenant, or another project, holding the same ref', async () => {
    const blob = memoryBlob();
    await putFragment(
      blob,
      { ref: REF, text: 'acme only', kind: 'code' },
      { tenantId: 'acme', projectId: 'default' },
    );
    const source = createBlobFragmentSource(blob);

    // This is the IDOR guard at its root: the ref is identical and entirely derivable.
    expect(await source.forTenant('globex').get(REF)).toBeUndefined();
    expect(await source.forTenant('acme').forProject('beta').get(REF)).toBeUndefined();
    expect(await source.forTenant('acme').get(REF)).toMatchObject({ text: 'acme only' });
  });

  it('forTenant resets the project scope to its default', async () => {
    const blob = memoryBlob();
    await putFragment(
      blob,
      { ref: REF, text: 'acme default project', kind: 'code' },
      { tenantId: 'acme', projectId: 'default' },
    );

    const source = createBlobFragmentSource(blob).forProject('beta').forTenant('acme');

    expect(await source.get(REF)).toMatchObject({ text: 'acme default project' });
  });

  it('a malformed or non-document blob resolves to undefined rather than throwing', async () => {
    const blob = memoryBlob();
    await blob.put(corpusKey(DEFAULT_CORPUS_SCOPE, 'bad-json'), new TextEncoder().encode('{['));
    await blob.put(corpusKey(DEFAULT_CORPUS_SCOPE, 'not-a-doc'), encodeDocument({} as never));
    const source = createBlobFragmentSource(blob);

    expect(await source.get('bad-json')).toBeUndefined();
    expect(await source.get('not-a-doc')).toBeUndefined();
  });

  it('deleteFragment removes exactly the scoped key', async () => {
    const blob = memoryBlob();
    const acme = { tenantId: 'acme', projectId: 'default' };
    await putFragment(blob, { ref: REF, text: 'a', kind: 'code' }, acme);
    await putFragment(
      blob,
      { ref: REF, text: 'g', kind: 'code' },
      { tenantId: 'globex', projectId: 'default' },
    );

    await deleteFragment(blob, REF, acme);

    expect(await blob.list()).toEqual([`globex/default/${REF}`]);
  });
});
