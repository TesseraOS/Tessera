import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startApiServer, type ApiServerHandle } from './api.js';

/** Boots the real Local profile over an ephemeral port and talks to it over HTTP (offline, fake embeddings). */
describe('startApiServer', () => {
  let handle: ApiServerHandle | undefined;
  let dir: string | undefined;

  afterEach(async () => {
    await handle?.close();
    handle = undefined;
    if (dir !== undefined) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('boots the local profile and serves the /v1 API over HTTP', async () => {
    dir = await mkdtemp(join(tmpdir(), 'tessera-server-'));
    handle = await startApiServer({
      port: 0,
      config: {
        storage: { sqlitePath: ':memory:', vectorPath: ':memory:', blobRoot: join(dir, 'blobs') },
        embeddings: { provider: 'fake', dimension: 8 },
      },
    });

    expect(handle.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

    const health = await fetch(`${handle.url}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok' });

    const ready = await fetch(`${handle.url}/ready`);
    expect(ready.status).toBe(200);

    const openapi = await fetch(`${handle.url}/v1/openapi.json`);
    expect(openapi.status).toBe(200);
    expect(((await openapi.json()) as { openapi: string }).openapi).toMatch(/^3\./);
  });
});
