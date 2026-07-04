import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/load';
import { createLocalRuntime } from '../../src/profiles/local';
import type { Runtime } from '../../src/runtime';

/** Write a small fixture repo (a readme, a source file, and an ADR) and return its root. */
async function writeFixtureRepo(root: string): Promise<void> {
  await mkdir(join(root, 'src'), { recursive: true });
  await mkdir(join(root, 'docs', 'adr'), { recursive: true });
  await writeFile(join(root, 'README.md'), '# Project\n\nAuthentication uses signed tokens.\n');
  await writeFile(join(root, 'src', 'index.ts'), 'export const x = 1;\n');
  await writeFile(
    join(root, 'docs', 'adr', '0001-use-sqlite.md'),
    '# Use SQLite locally\n\n- **Status:** accepted\n\n## Decision\n\nUse SQLite for the local profile.\n',
  );
}

describe('runtime source management (F-038)', () => {
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

  async function makeRuntime(overrides: Record<string, string> = {}): Promise<Runtime> {
    const dataDir = await tempDir('tessera-sources-data-');
    const config = loadConfig({
      TESSERA_SQLITE_PATH: ':memory:',
      TESSERA_VECTOR_PATH: ':memory:',
      TESSERA_BLOB_ROOT: join(dataDir, 'blobs'),
      TESSERA_EMBEDDINGS_PROVIDER: 'fake',
      TESSERA_EMBEDDINGS_DIMENSION: '8',
      ...overrides,
    });
    return createLocalRuntime(config);
  }

  it('registers a filesystem source, scans it, and streams progress on the SSE bus', async () => {
    const rt = (runtime = await makeRuntime());
    const repo = await tempDir('tessera-sources-repo-');
    await writeFixtureRepo(repo);

    // Subscribe to the runtime SSE bus (the same one buildServer streams on GET /v1/events).
    const streamed: string[] = [];
    rt.events.on('source.scan.started', () => void streamed.push('started'));
    rt.events.on(
      'source.scan.completed',
      (e) => void streamed.push(`completed:${e.summary.added}`),
    );
    rt.events.on('document.ingested', (e) => void streamed.push(`ingested:${e.path}`));

    const source = await rt.services.sources.register({
      kind: 'filesystem',
      config: { root: repo },
    });
    expect(source.kind).toBe('filesystem');

    const { summary } = await rt.services.sources.scan(source.id);
    expect(summary).toEqual({ added: 3, modified: 0, removed: 0, unchanged: 0 });

    // SSE progress: a start, three document events, and a completion carrying the counts.
    expect(streamed).toContain('started');
    expect(streamed).toContain('ingested:README.md');
    expect(streamed).toContain('ingested:docs/adr/0001-use-sqlite.md');
    expect(streamed).toContain('completed:3');

    // Documents land in the compiler corpus (memory fragments — extracted ADRs — are indexed too, F-039).
    const docFragments = (await rt.stores.blob.list()).filter((ref) => !ref.startsWith('memory/'));
    expect(docFragments.length).toBe(3);

    // The ADR was auto-extracted into a decision memory through the wired runtime (closing the loop).
    const decisions = await rt.services.memory.list({ kind: 'decision' });
    expect(decisions.some((m) => m.title === 'Use SQLite locally')).toBe(true);

    // Scan status reflects the completed scan.
    const status = await rt.services.sources.scanStatus(source.id);
    expect(status?.state).toBe('idle');
    expect(status?.lastScan?.summary.added).toBe(3);
  });

  it('is incremental + idempotent on re-scan and detects edits', async () => {
    const rt = (runtime = await makeRuntime());
    const repo = await tempDir('tessera-sources-repo-');
    await writeFixtureRepo(repo);
    const source = await rt.services.sources.register({
      kind: 'filesystem',
      config: { root: repo },
    });

    await rt.services.sources.scan(source.id);

    // Re-scan with no changes → nothing re-indexed.
    const again = await rt.services.sources.scan(source.id);
    expect(again.summary).toEqual({ added: 0, modified: 0, removed: 0, unchanged: 3 });
    const docFragments = (await rt.stores.blob.list()).filter((ref) => !ref.startsWith('memory/'));
    expect(docFragments.length).toBe(3);

    // Edit a file → exactly one modification.
    await writeFile(join(repo, 'README.md'), '# Project\n\nAuthentication now uses OIDC.\n');
    const edited = await rt.services.sources.scan(source.id);
    expect(edited.summary.modified).toBe(1);
  });

  it('lists and removes sources; a removed source cannot be scanned', async () => {
    const rt = (runtime = await makeRuntime());
    const repo = await tempDir('tessera-sources-repo-');
    await writeFixtureRepo(repo);
    const source = await rt.services.sources.register({
      kind: 'filesystem',
      config: { root: repo },
    });

    expect((await rt.services.sources.list()).map((s) => s.id)).toEqual([source.id]);
    await rt.services.sources.remove(source.id);
    expect(await rt.services.sources.list()).toHaveLength(0);
    await expect(rt.services.sources.scan(source.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects an unsupported source kind', async () => {
    const rt = (runtime = await makeRuntime());
    await expect(
      rt.services.sources.register({ kind: 'svn', config: { root: '/x' } }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(await rt.services.sources.list()).toHaveLength(0);
  });

  it('persists registered sources across a restart (file-backed SQLite)', async () => {
    const dataDir = await tempDir('tessera-sources-persist-');
    const dbPath = join(dataDir, 'tessera.db');
    const repo = await tempDir('tessera-sources-repo-');
    await writeFixtureRepo(repo);

    const first = await makeRuntime({ TESSERA_SQLITE_PATH: dbPath });
    const registered = await first.services.sources.register({
      kind: 'git',
      label: 'my-repo',
      config: { root: repo },
    });
    await first.close();

    // Reopen the same database file — the source must still be there.
    runtime = await makeRuntime({ TESSERA_SQLITE_PATH: dbPath });
    const listed = await runtime.services.sources.list();
    expect(listed.map((s) => s.id)).toEqual([registered.id]);
    expect(listed[0]?.label).toBe('my-repo');
    expect(listed[0]?.config).toEqual({ root: repo });
  });
});
