import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startApiServer, type ApiServerHandle } from './api.js';

/**
 * The two things the composition root — not the transport — is responsible for (F-055, ADR-0058):
 * remote MCP is **absent** unless configured, and it **cannot** be configured onto an unauthenticated
 * deployment. The transport's own behaviour is covered in `@tessera/mcp`; the full remote journey is
 * `tests/e2e/mcp-http.e2e.test.ts`.
 */
describe('remote MCP mounting', () => {
  let handle: ApiServerHandle | undefined;
  let dir: string | undefined;

  afterEach(async () => {
    await handle?.close();
    handle = undefined;
    if (dir !== undefined) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  async function storage(): Promise<Record<string, string>> {
    dir = await mkdtemp(join(tmpdir(), 'tessera-mcp-mount-'));
    return { sqlitePath: ':memory:', vectorPath: ':memory:', blobRoot: join(dir, 'blobs') };
  }

  it('does not mount /mcp by default — stdio stays the local default', async () => {
    handle = await startApiServer({
      port: 0,
      config: { storage: await storage(), embeddings: { provider: 'fake', dimension: 8 } },
    });

    const response = await fetch(`${handle.url}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(404);
  });

  it('refuses to BOOT with remote MCP enabled under auth.mode=none (NFR-2)', async () => {
    // Fails at config load, before a single adapter is constructed — not at the first request, and
    // not by silently ignoring the setting, which would leave an operator believing it was on.
    await expect(
      startApiServer({
        port: 0,
        config: {
          auth: { mode: 'none' },
          mcp: { http: { enabled: true } },
          storage: await storage(),
          embeddings: { provider: 'fake', dimension: 8 },
        },
      }),
    ).rejects.toThrow(/invalid configuration/);
  });

  it('mounts at a configured non-default path', async () => {
    handle = await startApiServer({
      port: 0,
      config: {
        auth: { mode: 'token' },
        mcp: { http: { enabled: true, path: '/agent/mcp' } },
        storage: await storage(),
        embeddings: { provider: 'fake', dimension: 8 },
      },
    });

    // Unauthenticated, so 401 rather than 404 — which is exactly the proof the route is there.
    const mounted = await fetch(`${handle.url}/agent/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(mounted.status).toBe(401);

    const notMounted = await fetch(`${handle.url}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(notMounted.status).toBe(404);
  });
});
