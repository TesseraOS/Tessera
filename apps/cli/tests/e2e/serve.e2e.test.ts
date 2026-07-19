import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { serveApi } from '../../src/commands/serve.js';
import { captureIo } from '../support/capture-io.js';

describe('serve (F-052)', () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
    dirs.length = 0;
  });

  it('boots the REST API on an ephemeral port and serves the public OpenAPI doc', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tessera-cli-serve-'));
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

    const handle = await serveApi(io, { port: 0 });
    try {
      expect(handle.url).toMatch(/^http:\/\//);
      const response = await fetch(`${handle.url}/v1/openapi.json`);
      expect(response.status).toBe(200);
      const doc = (await response.json()) as { openapi?: string; paths?: unknown };
      expect(typeof doc.openapi).toBe('string');
    } finally {
      await handle.close();
    }
  });
});
