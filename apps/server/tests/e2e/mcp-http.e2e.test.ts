import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, describe, expect, it } from 'vitest';
import { startApiServer, type ApiServerHandle } from '../../src/api';

/**
 * F-055 acceptance clause 3, over the **real composition root**: a real MCP client connects to the
 * shipped `startApiServer` over HTTP with a token issued by the F-034 store, and RBAC, quotas, and the
 * audit trail are enforced by the *runtime's* own providers — not test doubles.
 *
 * `@tessera/mcp`'s own e2e proves the transport is host-independent; this proves the deployment.
 */
describe('remote MCP through the real API server', () => {
  let handle: ApiServerHandle | undefined;
  let dir: string | undefined;
  let clients: Client[] = [];

  afterEach(async () => {
    await Promise.all(clients.map((client) => client.close()));
    clients = [];
    await handle?.close();
    handle = undefined;
    if (dir !== undefined) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  /** Boot the real Local profile with remote MCP enabled (offline: in-memory stores, fake embeddings). */
  async function boot(overrides: Record<string, unknown> = {}): Promise<ApiServerHandle> {
    dir = await mkdtemp(join(tmpdir(), 'tessera-mcp-http-'));
    handle = await startApiServer({
      port: 0,
      config: {
        auth: { mode: 'token', ...(overrides['auth'] as object) },
        mcp: { http: { enabled: true } },
        storage: { sqlitePath: ':memory:', vectorPath: ':memory:', blobRoot: join(dir, 'blobs') },
        embeddings: { provider: 'fake', dimension: 8 },
      },
    });
    return handle;
  }

  /** Issue a token from the runtime's persistent store — the F-034 store, not a double. */
  async function issue(roles: string[]): Promise<string> {
    const tokenStore = handle?.runtime.auth.tokenStore;
    expect(tokenStore).toBeDefined();
    const { token } = await tokenStore!.issue({
      tenantId: 'default',
      principalId: 'remote-agent',
      roles: roles as never,
    });
    return token;
  }

  async function connect(url: string, token: string): Promise<Client> {
    const transport = new StreamableHTTPClientTransport(new URL(`${url}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    });
    const client = new Client({ name: 'e2e-remote-agent', version: '0.0.0' });
    await client.connect(transport);
    clients.push(client);
    return client;
  }

  function errorCode(result: { structuredContent?: unknown }): string | undefined {
    return ((result.structuredContent ?? {}) as { error?: { code?: string } }).error?.code;
  }

  it('serves a real MCP client over HTTP beside REST, with a token from the F-034 store', async () => {
    const server = await boot();
    const client = await connect(server.url, await issue(['member']));

    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(0);

    const search = await client.callTool({ name: 'search', arguments: { query: 'anything' } });
    expect(search.isError).toBeFalsy();

    const captured = await client.callTool({
      name: 'capture_memory',
      arguments: { kind: 'decision', title: 'Remote', body: 'Captured over remote MCP.' },
    });
    expect(captured.isError).toBeFalsy();

    // REST is unchanged and served by the same process on the same port.
    const rest = await fetch(`${server.url}/v1/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'anything' }),
    });
    expect(rest.status).toBe(401); // still token-guarded
  });

  it('records the remote call in the runtime’s own audit trail', async () => {
    const server = await boot();
    const client = await connect(server.url, await issue(['member']));

    await client.callTool({
      name: 'capture_memory',
      arguments: { kind: 'decision', title: 'Audited', body: 'This call must be in the trail.' },
    });

    const audit = server.runtime.audit;
    expect(audit).toBeDefined();
    const { events } = await audit!.forTenant('default').query();
    expect(events).toContainEqual(
      expect.objectContaining({
        action: 'memory.write',
        target: 'capture_memory',
        outcome: 'success',
        metadata: expect.objectContaining({ surface: 'mcp' }),
      }),
    );
  });

  it('enforces RBAC on the remote surface (a viewer cannot write)', async () => {
    const server = await boot();
    const client = await connect(server.url, await issue(['viewer']));

    const denied = await client.callTool({
      name: 'capture_memory',
      arguments: { kind: 'decision', title: 'Nope', body: 'A viewer may not write.' },
    });
    expect(denied.isError).toBe(true);
    expect(errorCode(denied)).toBe('FORBIDDEN');
  });

  it('rejects an unauthenticated connection with 401 and keeps the F-044 hardening headers', async () => {
    const server = await boot();

    const response = await fetch(`${server.url}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe('Bearer error="invalid_token"');
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'UNAUTHORIZED',
    );
    // The hijacked reply must still carry what F-044 puts on every response.
    expect(response.headers.get('x-request-id')).toBeTruthy();
    expect(response.headers.get('content-security-policy')).toBeTruthy();
  });

  it('does not describe /mcp in the OpenAPI document (it is not a REST operation)', async () => {
    const server = await boot();
    const document = (await (await fetch(`${server.url}/v1/openapi.json`)).json()) as {
      paths: Record<string, unknown>;
    };

    expect(Object.keys(document.paths)).not.toContain('/mcp');
  });

  it('shuts down cleanly while a remote client is still connected', async () => {
    const server = await boot();
    await connect(server.url, await issue(['member']));

    // An open MCP stream is not an "idle" connection, so a naive app.close() would hang here.
    await expect(server.close()).resolves.toBeUndefined();
    handle = undefined;
  });
});
