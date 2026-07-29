import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/load';
import { createLocalRuntime } from '../../src/profiles/local';
import { createCorpusIndexer } from '../../src/sources/corpus-indexer';
import type { Runtime } from '../../src/runtime';

/**
 * F-075's red-before proof, run against the REAL Local runtime rather than a fake blob store.
 *
 * Both assertions were written to fail at HEAD (they did), because the corpus had exactly one key
 * space: `putFragment` wrote the bare `ref`, so a blob carried no record of who owned it. The second
 * test is the consequence stated at its sharpest — two tenants indexing the same ref left ONE body,
 * silently.
 */
describe('corpus keys carry their (tenant, project) scope', () => {
  let runtime: Runtime | undefined;
  let dir: string | undefined;

  afterEach(async () => {
    await runtime?.close();
    runtime = undefined;
    if (dir !== undefined) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  async function makeRuntime(): Promise<Runtime> {
    dir = await mkdtemp(join(tmpdir(), 'tessera-corpus-scope-'));
    const config = loadConfig({
      TESSERA_SQLITE_PATH: ':memory:',
      TESSERA_VECTOR_PATH: ':memory:',
      TESSERA_BLOB_ROOT: join(dir, 'blobs'),
      TESSERA_EMBEDDINGS_PROVIDER: 'fake',
      TESSERA_EMBEDDINGS_DIMENSION: '8',
    });
    return createLocalRuntime(config);
  }

  it('a memory captured as `acme` lands under acme/default/, not at the bare ref', async () => {
    const rt = (runtime = await makeRuntime());

    const captured = await rt.services.memory
      .forTenant('acme')
      .capture({ kind: 'decision', title: 'Ledger rounding', body: 'half-even, always' });

    const keys = await rt.stores.blob.list();
    const corpusKeys = keys.filter((key) => !key.startsWith('_tessera/'));

    expect(corpusKeys).toEqual([`acme/default/memory/${captured.lineageId}`]);
  });

  it('two tenants indexing the SAME ref keep two bodies — the corpus is not one key space', async () => {
    const rt = (runtime = await makeRuntime());
    const indexer = createCorpusIndexer({
      blob: rt.stores.blob,
      keyword: rt.keyword,
      temporal: rt.temporal,
      embeddings: rt.embeddings,
      vector: rt.stores.vector,
    });

    // A REAL document ref: `documentIdFor` is a sha256 hex digest, so this is the shape a collision
    // would actually take. (Not `doc:shared` — a `:` becomes an NTFS alternate-data-stream and would
    // conflate this defect with a different one, which is why memory refs are `/`-delimited.)
    const ref = 'a'.repeat(64);

    await indexer.indexDocument({
      ref,
      text: 'acme owns this text',
      kind: 'markdown',
      tenantId: 'acme',
    });
    await indexer.indexDocument({
      ref,
      text: 'globex owns this text',
      kind: 'markdown',
      tenantId: 'globex',
    });

    const corpusKeys = (await rt.stores.blob.list()).filter((key) => !key.startsWith('_tessera/'));

    // At HEAD this was a single bare `<ref>` — globex's write had overwritten acme's body in place.
    expect([...corpusKeys].sort()).toEqual([`acme/default/${ref}`, `globex/default/${ref}`]);
  });
});
