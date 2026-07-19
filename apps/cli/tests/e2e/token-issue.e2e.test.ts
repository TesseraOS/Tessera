import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { run } from '../../src/cli.js';
import { captureIo } from '../support/capture-io.js';

describe('token issue (F-052)', () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
    dirs.length = 0;
  });

  it('issues a scoped token in token auth mode', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tessera-cli-token-'));
    dirs.push(dir);
    const io = captureIo({
      cwd: dir,
      env: {
        TESSERA_AUTH_MODE: 'token',
        TESSERA_SQLITE_PATH: ':memory:',
        TESSERA_VECTOR_PATH: ':memory:',
        TESSERA_BLOB_ROOT: join(dir, 'blobs'),
        TESSERA_EMBEDDINGS_PROVIDER: 'fake',
        TESSERA_EMBEDDINGS_DIMENSION: '8',
      },
    });

    const code = await run(
      ['token', 'issue', '--roles', 'owner', '--principal', 'ci', '--json'],
      io,
    );
    expect(code).toBe(0);
    const out = JSON.parse(io.out()) as {
      id: string;
      principalId: string;
      roles: string[];
      token: string;
    };
    expect(out.principalId).toBe('ci');
    expect(out.roles).toEqual(['owner']);
    expect(out.token.length).toBeGreaterThan(0);
  });

  it('fails cleanly when auth is not in token mode', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tessera-cli-token-none-'));
    dirs.push(dir);
    const io = captureIo({
      cwd: dir,
      env: {
        TESSERA_SQLITE_PATH: ':memory:',
        TESSERA_VECTOR_PATH: ':memory:',
        TESSERA_BLOB_ROOT: join(dir, 'blobs'),
        TESSERA_EMBEDDINGS_PROVIDER: 'fake',
        TESSERA_EMBEDDINGS_DIMENSION: '8',
      },
    });

    const code = await run(['token', 'issue', '--roles', 'owner'], io);
    expect(code).toBe(1);
    expect(io.err()).toContain('auth.mode=token');
  });
});
