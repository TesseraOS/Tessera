import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/load';
import { createLocalRuntime } from '../../src/profiles/local';
import type { Runtime } from '../../src/runtime';

/**
 * F-039: after ingestion, `search`/`compile` answer from the user's ACTUAL repository, and captured
 * memories are findable too. Uses the real Local runtime with fake (deterministic, offline) embeddings.
 */
describe('live corpus indexing (F-039)', () => {
  let runtime: Runtime | undefined;
  const dirs: string[] = [];

  afterEach(async () => {
    await runtime?.close();
    runtime = undefined;
    await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
    dirs.length = 0;
  });

  async function tempDir(prefix: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), prefix));
    dirs.push(dir);
    return dir;
  }

  async function makeRuntime(): Promise<Runtime> {
    const dataDir = await tempDir('tessera-indexing-data-');
    return createLocalRuntime(
      loadConfig({
        TESSERA_SQLITE_PATH: ':memory:',
        TESSERA_VECTOR_PATH: ':memory:',
        TESSERA_BLOB_ROOT: join(dataDir, 'blobs'),
        TESSERA_EMBEDDINGS_PROVIDER: 'fake',
        TESSERA_EMBEDDINGS_DIMENSION: '16',
      }),
    );
  }

  async function scanFixture(rt: Runtime): Promise<void> {
    const repo = await tempDir('tessera-indexing-repo-');
    await mkdir(join(repo, 'src'), { recursive: true });
    await writeFile(
      join(repo, 'README.md'),
      '# Service\n\nAuthentication uses signed tokens to verify the caller on every request.\n',
    );
    await writeFile(join(repo, 'src', 'db.ts'), 'export function connect() { return "sqlite"; }\n');
    const source = await rt.services.sources.register({
      kind: 'filesystem',
      config: { root: repo },
    });
    await rt.services.sources.scan(source.id);
  }

  it('search + compile answer from the ingested repository, with multi-signal attribution', async () => {
    const rt = (runtime = await makeRuntime());
    await scanFixture(rt);

    const results = await rt.services.search.search({ text: 'authentication signed tokens' });
    expect(results.length).toBeGreaterThan(0);
    const top = results[0];
    expect(top).toBeDefined();
    // Multi-signal attribution: the ingested file is found by more than one signal (keyword + temporal
    // at minimum; semantic when it ranks in top-k).
    expect(top?.signals.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(top?.signals.map((s) => s.signal)).toContain('keyword');

    // compile cites the ingested file and stays within budget.
    const pkg = await rt.services.compiler.compile({
      task: 'authentication signed tokens',
      budget: 500,
    });
    const refs = pkg.sections.flatMap((section) => section.fragments).map((f) => f.ref);
    expect(refs).toContain(top?.ref);
    expect(pkg.totalTokens).toBeLessThanOrEqual(500);
  });

  it('a just-captured memory is immediately findable, and an edit updates the index', async () => {
    const rt = (runtime = await makeRuntime());

    const memory = await rt.services.memory.capture({
      kind: 'decision',
      title: 'Payment provider',
      body: 'we selected stripe for payments processing',
    });
    const ref = `memory/${memory.lineageId}`;

    const found = await rt.services.search.search({ text: 'stripe payments' });
    expect(found.map((c) => c.ref)).toContain(ref);

    // Editing supersedes the body and re-indexes the SAME ref.
    await rt.services.memory.edit(memory.lineageId, {
      body: 'we migrated to adyen for payments processing',
    });
    const afterEdit = await rt.services.search.search({ text: 'adyen payments' });
    expect(afterEdit.map((c) => c.ref)).toContain(ref);
  });
});
