import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { run } from '../../src/cli.js';
import { captureIo } from '../support/capture-io.js';
import { writeFixtureRepo } from '../support/fixture-repo.js';

describe('one-command story: init → source add (F-052)', () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
    dirs.length = 0;
  });

  async function temp(prefix: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), prefix));
    dirs.push(dir);
    return dir;
  }

  it('init scaffolds a bootable project and source add ingests a repo into it', async () => {
    const projectDir = await temp('tessera-cli-proj-');
    const dataDir = await temp('tessera-cli-data-');
    const repo = await temp('tessera-cli-repo-');
    await writeFixtureRepo(repo);
    // fake embeddings keep the boot offline; the dimension comes via env (merged with the file's provider).
    const env = { TESSERA_EMBEDDINGS_DIMENSION: '8' };

    // init: an absolute --data-dir makes the written config cwd-independent (so this test needs no chdir).
    const initIo = captureIo({ cwd: projectDir, env });
    const initCode = await run(
      ['init', '--data-dir', dataDir, '--embeddings', 'fake', '--json'],
      initIo,
    );
    expect(initCode).toBe(0);
    const initOut = JSON.parse(initIo.out()) as { configFile: string; dataDir: string };
    expect(existsSync(initOut.configFile)).toBe(true);
    expect(existsSync(join(dataDir, 'blobs'))).toBe(true);

    // The written config validates and pins fake embeddings + the absolute storage root.
    const written = JSON.parse(await readFile(initOut.configFile, 'utf8')) as {
      embeddings: { provider: string };
      storage: { blobRoot: string };
    };
    expect(written.embeddings.provider).toBe('fake');
    // The config stores POSIX-style paths for portability, so compare on a slash-normalized basis.
    expect(written.storage.blobRoot.replace(/\\/g, '/')).toContain(dataDir.replace(/\\/g, '/'));

    // source add: registers + scans the fixture repo into the project's corpus (the F-038 surface).
    const addIo = captureIo({ cwd: projectDir, env });
    const addCode = await run(['source', 'add', repo, '--json'], addIo);
    expect(addCode).toBe(0);
    const added = JSON.parse(addIo.out()) as {
      id: string;
      kind: string;
      summary: { added: number };
    };
    expect(added.kind).toBe('filesystem');
    expect(added.summary.added).toBe(3);
  });
});
