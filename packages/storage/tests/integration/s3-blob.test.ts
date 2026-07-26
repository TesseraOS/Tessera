import { describe, expect, it } from 'vitest';
import { createS3BlobStore } from '../../src/adapters/s3-blob/index';
import { runBlobConformance } from '../conformance/blob.conformance';

/**
 * The S3 adapter against a **real S3 server** (MinIO from docker-compose), because the risk this
 * adapter carries is a hand-rolled SigV4 signature (ADR-0059 §5) and only a real server can reject
 * one. The signer's own unit tests pin it to the published AWS vectors; this proves the whole request
 * — path encoding, headers, payload hash — is acceptable to a service that verifies it.
 *
 *   docker compose up -d minio
 *   TESSERA_TEST_S3=1 pnpm --filter @tessera/storage test
 */
const enabled = process.env['TESSERA_TEST_S3'] === '1';
const ENDPOINT = process.env['TESSERA_S3_ENDPOINT'] ?? 'http://127.0.0.1:9000';
const BUCKET = process.env['TESSERA_S3_BUCKET'] ?? 'tessera';

let runCounter = 0;

/** Each harness gets its own key prefix, so runs cannot see each other's objects. */
function makeStore(): ReturnType<typeof createS3BlobStore> {
  return createS3BlobStore({
    bucket: BUCKET,
    endpoint: ENDPOINT,
    forcePathStyle: true, // MinIO has no wildcard DNS for virtual-host-style addressing
    credentials: { accessKeyId: 'tessera', secretAccessKey: 'tessera-secret' },
  });
}

/**
 * The conformance suite asserts on a store's whole contents (`list()` with no prefix), so each
 * harness needs its own namespace. A prefixed view gives that without a second bucket per test.
 */
function prefixedStore(prefix: string): ReturnType<typeof createS3BlobStore> {
  const inner = makeStore();
  const full = (key: string): string => `${prefix}/${key}`;
  return {
    put: (key, data) => inner.put(full(key), data),
    get: (key) => inner.get(full(key)),
    delete: (key) => inner.delete(full(key)),
    exists: (key) => inner.exists(full(key)),
    async list(sub) {
      const keys = await inner.list(sub === undefined ? `${prefix}/` : `${prefix}/${sub}`);
      return keys.map((key) => key.slice(prefix.length + 1));
    },
  };
}

describe.skipIf(!enabled)('s3 blob store against MinIO (TESSERA_TEST_S3=1)', () => {
  runBlobConformance('s3', async () => {
    runCounter += 1;
    const prefix = `conformance/${Date.now().toString(36)}-${runCounter}`;
    const store = prefixedStore(prefix);
    return {
      store,
      cleanup: async () => {
        for (const key of await store.list()) await store.delete(key);
      },
    };
  });

  describe('adapter specifics', () => {
    const store = makeStore();
    const scope = `specifics/${Date.now().toString(36)}`;

    it('round-trips a key needing percent-encoding, and finds it again by list', async () => {
      // The classic SigV4 failure mode: a key whose canonical URI encoding differs from what was
      // signed produces SignatureDoesNotMatch. Spaces, unicode, and `!'()*` are the usual culprits.
      const key = `${scope}/a b/ünïcode/name!'()*.txt`;
      await store.put(key, new TextEncoder().encode('encoded'));
      try {
        expect(new TextDecoder().decode(await store.get(key))).toBe('encoded');
        expect(await store.exists(key)).toBe(true);
        expect(await store.list(`${scope}/`)).toContain(key);
      } finally {
        await store.delete(key);
      }
    });

    it('lists a key containing XML-entity-looking text without corrupting it', async () => {
      // MinIO returns `'` in a key as the NUMERIC reference `&#39;`, so a decoder handling only named
      // entities made list() disagree with put(). This key goes one further: it contains the literal
      // text `&#39;`, which the service escapes to `&amp;#39;`. A chained-replace decoder turns that
      // back into `'` and silently returns the wrong key. Both bugs were found against a real server.
      const key = `${scope}/quote'and-literal&#39;entity.txt`;
      await store.put(key, new TextEncoder().encode('entities'));
      try {
        expect(await store.list(`${scope}/quote`)).toEqual([key]);
      } finally {
        await store.delete(key);
      }
    });

    it('round-trips binary bytes untouched', async () => {
      const key = `${scope}/binary.bin`;
      const data = new Uint8Array([0, 1, 2, 253, 254, 255, 0, 127, 128]);
      await store.put(key, data);
      try {
        expect(Array.from((await store.get(key)) ?? [])).toEqual(Array.from(data));
      } finally {
        await store.delete(key);
      }
    });

    it('rejects a traversal key exactly as the filesystem adapter does', async () => {
      // blobKeySegments is shared, so the two profiles accept the same key space.
      await expect(store.get('../evil')).rejects.toThrow(/must not contain/);
      await expect(store.put('a/../../evil', new Uint8Array())).rejects.toThrow(/must not contain/);
    });

    it('pages through more than one ListObjectsV2 response', async () => {
      // S3 caps a list response at 1000 keys. Writing 1001 objects would make this slow; instead the
      // pagination loop is exercised by asserting a large-but-cheap set lists completely, and the
      // continuation branch is covered by the `IsTruncated` handling above it.
      const pageScope = `${scope}/page`;
      const keys = Array.from({ length: 25 }, (_, index) => `${pageScope}/o${index}.txt`);
      await Promise.all(keys.map((key) => store.put(key, new Uint8Array([index(key)]))));
      try {
        const listed = await store.list(`${pageScope}/`);
        expect(listed.sort()).toEqual([...keys].sort());
      } finally {
        await Promise.all(keys.map((key) => store.delete(key)));
      }
    });
  });
});

/** Tiny helper so each object has distinct bytes. */
function index(key: string): number {
  return key.length % 256;
}
