import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { putFragment } from '../../src/fragment-source';
import { loadConfig } from '../../src/load';
import { createRuntime } from '../../src/profiles/create-runtime';
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
    await rt.keyword.index('doc:auth', 'authentication uses signed tokens to verify the caller');
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

  it('exposes a plugin host and reports the EMPTY set honestly on /ready (F-058, ADR-0061 §3)', async () => {
    runtime = await makeRuntime();

    // The whole point of the wiring: registering a plugin is now a call, not a rebuild of the
    // composition root.
    expect(runtime.plugins.list()).toEqual([]);

    const report = await runtime.services.readiness?.();

    // `ok: true` alone cannot distinguish "nothing is broken" from "nothing is loaded", so the detail
    // has to say which. This is the shipped state of every profile today.
    expect(report?.checks.find((check) => check.name === 'plugins')).toEqual({
      name: 'plugins',
      ok: true,
      detail: '0 plugins registered',
    });
    expect(report?.ready).toBe(true);
  });

  it('a registered, unhealthy plugin makes /ready NOT ready — the aggregation is real', async () => {
    runtime = await makeRuntime();
    runtime.plugins.register({
      manifest: {
        id: 'test.broken',
        kind: 'processor',
        name: 'Broken',
        version: '1.0.0',
        configSchema: z.object({}),
      },
      setup: () => ({
        capability: {},
        health: () => ({ ok: false, detail: 'upstream unreachable' }),
      }),
    });
    await runtime.plugins.load('test.broken');
    await runtime.plugins.start('test.broken');

    const report = await runtime.services.readiness?.();

    // Proves the empty-set report above is honest rather than hardcoded: the same check goes red
    // when something real is wrong.
    expect(report?.ready).toBe(false);
    expect(report?.checks.find((check) => check.name === 'plugins')).toEqual({
      name: 'plugins',
      ok: false,
      detail: '1 registered; unhealthy: test.broken',
    });
  });

  it('no longer refuses a non-local profile — F-056 closed the F-023 deferral', async () => {
    // This test used to assert `rejects.toThrow(/not wired/)`. That throw was the whole of the
    // F-023/ADR-0026 deferral, and F-056 deleted it: `createRuntime` now selects a real self-hosted
    // profile. Rewritten rather than removed, so the change of behaviour stays visible in history.
    //
    // `createSelfHostedRuntime` needs Postgres/Redis/S3, so this asserts only what can be asserted
    // offline: the failure is now about a MISSING CONNECTION, not an unimplemented profile. The real
    // boot is `self-hosted-profile.test.ts` (guarded by TESSERA_TEST_SELF_HOSTED=1).
    const config = loadConfig({ TESSERA_PROFILE: 'self-hosted' });
    await expect(createRuntime(config, { env: {} })).rejects.toThrow(/DATABASE_URL/);
    await expect(createRuntime(config, { env: {} })).rejects.not.toThrow(/not wired/);
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
