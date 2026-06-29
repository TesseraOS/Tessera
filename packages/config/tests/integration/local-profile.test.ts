import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { putFragment } from '../../src/fragment-source';
import { loadConfig } from '../../src/load';
import { createLocalRuntime } from '../../src/profiles/local';
import type { Runtime } from '../../src/runtime';

describe('local profile runtime', () => {
  let runtime: Runtime | undefined;
  let dir: string | undefined;

  afterEach(async () => {
    await runtime?.close();
    runtime = undefined;
    if (dir !== undefined) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  async function makeRuntime(): Promise<Runtime> {
    dir = await mkdtemp(join(tmpdir(), 'tessera-local-'));
    const config = loadConfig({
      TESSERA_SQLITE_PATH: ':memory:',
      TESSERA_VECTOR_PATH: ':memory:',
      TESSERA_BLOB_ROOT: join(dir, 'blobs'),
      TESSERA_EMBEDDINGS_PROVIDER: 'fake',
      TESSERA_EMBEDDINGS_DIMENSION: '8',
    });
    return createLocalRuntime(config);
  }

  it('wires services that actually work end-to-end, with zero external deps', async () => {
    const rt = (runtime = await makeRuntime());
    expect(rt.embeddings.info.dimension).toBe(8);

    // Memory: capture then read back through the wired SQLite store.
    const captured = await rt.services.memory.capture({ kind: 'decision', title: 't', body: 'b' });
    expect(await rt.services.memory.getCurrent(captured.lineageId)).toMatchObject({
      id: captured.id,
    });

    // Knowledge graph + get_effects.
    await rt.services.graph.upsertNode({ kind: 'file', key: 'src/a.ts', label: 'a' });
    await rt.services.graph.upsertNode({ kind: 'file', key: 'src/b.ts', label: 'b' });
    await rt.services.graph.assertEffectLink({
      from: { kind: 'file', key: 'src/a.ts' },
      to: { kind: 'file', key: 'src/b.ts' },
      rationale: 'b depends on a',
    });
    const effects = await rt.services.graph.getEffects({ kind: 'file', key: 'src/a.ts' });
    expect(effects.map((hit) => hit.node.key)).toContain('src/b.ts');

    // Keyword index (owned by the wired retriever) + hybrid search.
    rt.keyword.index('doc:auth', 'authentication uses signed tokens to verify the caller');
    const results = await rt.services.search.search({ text: 'authentication tokens' });
    expect(results.map((candidate) => candidate.ref)).toContain('doc:auth');

    // Blob-backed fragment corpus + compile resolves it.
    await putFragment(rt.stores.blob, {
      ref: 'doc:auth',
      text: 'authentication uses signed tokens to verify the caller',
      kind: 'markdown',
    });
    const pkg = await rt.services.compiler.compile({ task: 'authentication tokens', budget: 200 });
    const refs = pkg.sections
      .flatMap((section) => section.fragments)
      .map((fragment) => fragment.ref);
    expect(refs).toContain('doc:auth');
    expect(pkg.totalTokens).toBeLessThanOrEqual(200);

    // Readiness probe reports healthy.
    expect(await rt.services.readiness?.()).toMatchObject({ ready: true });
  });

  it('refuses a non-local profile until the cloud profile lands (F-023)', async () => {
    const config = loadConfig({ TESSERA_PROFILE: 'cloud' });
    await expect(createLocalRuntime(config)).rejects.toThrow(/not wired/);
  });

  // Guarded: exercises the real Transformers.js default (downloads a model). Off by default to keep
  // gates fast/offline; run with TESSERA_TEST_TRANSFORMERS=1 (mirrors F-005).
  const runTransformers = process.env.TESSERA_TEST_TRANSFORMERS === '1';
  (runTransformers ? it : it.skip)(
    'wires the real Transformers.js embeddings provider (guarded)',
    async () => {
      dir = await mkdtemp(join(tmpdir(), 'tessera-local-tf-'));
      const config = loadConfig({
        TESSERA_SQLITE_PATH: ':memory:',
        TESSERA_VECTOR_PATH: ':memory:',
        TESSERA_BLOB_ROOT: join(dir, 'blobs'),
        TESSERA_EMBEDDINGS_PROVIDER: 'transformers',
      });
      const rt = (runtime = await createLocalRuntime(config));
      expect(rt.embeddings.info.dimension).toBe(384);
    },
    60_000,
  );
});
