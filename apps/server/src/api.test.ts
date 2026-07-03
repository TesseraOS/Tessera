import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createObservability } from '@tessera/observability';
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

  it('enforces token auth when config.auth.mode=token (F-034 wiring)', async () => {
    dir = await mkdtemp(join(tmpdir(), 'tessera-server-auth-'));
    handle = await startApiServer({
      port: 0,
      config: {
        auth: { mode: 'token' },
        storage: { sqlitePath: ':memory:', vectorPath: ':memory:', blobRoot: join(dir, 'blobs') },
        embeddings: { provider: 'fake', dimension: 8 },
      },
    });

    const search = (init?: RequestInit): Promise<Response> =>
      fetch(`${handle!.url}/v1/search`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
        body: JSON.stringify({ query: 'anything' }),
      });

    // No credential → 401 UNAUTHORIZED.
    const anon = await search();
    expect(anon.status).toBe(401);
    expect((await anon.json()).error.code).toBe('UNAUTHORIZED');

    // Issue a token via the runtime's persistent store, then authenticate.
    const tokenStore = handle.runtime.auth.tokenStore;
    expect(tokenStore).toBeDefined();
    const { token } = await tokenStore!.issue({
      tenantId: 'default',
      principalId: 'tester',
      roles: ['member'],
    });
    const authed = await search({ headers: { authorization: `Bearer ${token}` } });
    expect(authed.status).toBe(200);
    expect(await authed.json()).toHaveProperty('results');
  });

  it('serves an observability-instrumented server (F-016 wiring)', async () => {
    dir = await mkdtemp(join(tmpdir(), 'tessera-server-obs-'));
    handle = await startApiServer({
      port: 0,
      observability: createObservability({ logger: { level: 'silent' } }),
      config: {
        storage: { sqlitePath: ':memory:', vectorPath: ':memory:', blobRoot: join(dir, 'blobs') },
        embeddings: { provider: 'fake', dimension: 8 },
      },
    });

    const health = await fetch(`${handle.url}/health`);
    expect(health.status).toBe(200);

    const search = await fetch(`${handle.url}/v1/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'anything' }),
    });
    expect(search.status).toBe(200);
    expect(await search.json()).toHaveProperty('results');
  });
});
