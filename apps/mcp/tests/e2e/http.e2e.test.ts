import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createInMemoryAuditLog,
  createInMemoryTokenStore,
  createTokenAuthProvider,
  type AuditLog,
  type Role,
  type TokenStore,
} from '@tessera/api';
import { createInMemoryQuotaLimiter, createMcpGateway, type QuotaLimiter } from '../../src/index';
import { createMcpHttpHandler, type McpHttpHandler } from '../../src/http';
import { createInMemoryServices } from './support/in-memory-services';

/**
 * Remote MCP end to end (F-055): a **real** MCP SDK client over a **real** HTTP connection, against the
 * transport mounted on a bare `node:http` server — proving the handler is host-independent before
 * `@tessera/server` mounts it on Fastify.
 *
 * Unlike every other gateway e2e in this package, this one uses the **default** credential resolver
 * rather than injecting a fixed one, so the real `Authorization` → `AuthContext` path is exercised for
 * the first time.
 */
describe('@tessera/mcp remote transport (streamable HTTP)', () => {
  let servers: Server[] = [];
  let handlers: McpHttpHandler[] = [];
  let clients: Client[] = [];

  afterEach(async () => {
    await Promise.all(clients.map((client) => client.close()));
    await Promise.all(handlers.map((handler) => handler.close()));
    await Promise.all(
      servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    );
    clients = [];
    handlers = [];
    servers = [];
  });

  interface Harness {
    readonly url: URL;
    readonly handler: McpHttpHandler;
    readonly tokenStore: TokenStore;
    issue(principalId: string, roles: Role[]): Promise<string>;
  }

  async function serve(
    options: {
      quota?: QuotaLimiter;
      audit?: AuditLog;
      maxSessions?: number;
      sessionTtlMs?: number;
      now?: () => number;
    } = {},
  ): Promise<Harness> {
    const tokenStore = createInMemoryTokenStore();
    const handler = createMcpHttpHandler(await createInMemoryServices(), {
      gateway: createMcpGateway({
        auth: createTokenAuthProvider({ tokenStore }),
        ...(options.quota !== undefined ? { quota: options.quota } : {}),
        ...(options.audit !== undefined ? { audit: options.audit } : {}),
      }),
      ...(options.maxSessions !== undefined ? { maxSessions: options.maxSessions } : {}),
      ...(options.sessionTtlMs !== undefined ? { sessionTtlMs: options.sessionTtlMs } : {}),
      ...(options.now !== undefined ? { now: options.now } : {}),
      sweepIntervalMs: 0,
    });
    const server = createServer((req, res) => {
      void handler.handle(req, res);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);
    handlers.push(handler);

    return {
      url: new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`),
      handler,
      tokenStore,
      async issue(principalId, roles) {
        const { token } = await tokenStore.issue({ tenantId: 'acme', principalId, roles });
        return token;
      },
    };
  }

  /** Connect a real MCP client, carrying the Bearer credential the way a remote agent would. */
  async function connect(
    url: URL,
    token: string | undefined,
    extraHeaders: Record<string, string> = {},
  ): Promise<{ client: Client; transport: StreamableHTTPClientTransport }> {
    const transport = new StreamableHTTPClientTransport(url, {
      requestInit: {
        headers: {
          ...(token !== undefined ? { authorization: `Bearer ${token}` } : {}),
          ...extraHeaders,
        },
      },
    });
    const client = new Client({ name: 'remote-test-client', version: '0.0.0' });
    await client.connect(transport);
    clients.push(client);
    return { client, transport };
  }

  function errorCode(result: { structuredContent?: unknown }): string | undefined {
    return ((result.structuredContent ?? {}) as { error?: { code?: string } }).error?.code;
  }

  const MEMORY_ARGS = { kind: 'decision', title: 'Adopt X', body: 'We will adopt X because Y.' };

  it('rejects an unauthenticated connection before any session exists', async () => {
    const harness = await serve();

    await expect(connect(harness.url, undefined)).rejects.toThrow();
    expect(harness.handler.sessionCount).toBe(0);
  });

  it('serves a real client over HTTP with a token from the F-034 store', async () => {
    const harness = await serve();
    const { client, transport } = await connect(
      harness.url,
      await harness.issue('agent', ['member']),
    );

    expect(transport.sessionId).toBeTruthy();
    expect(harness.handler.sessionCount).toBe(1);

    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['search', 'compile_context', 'capture_memory', 'get_effects']),
    );

    const result = await client.callTool({
      name: 'search',
      arguments: { query: 'authentication' },
    });
    expect(result.isError).toBeFalsy();
  });

  it('enforces RBAC per call over the remote transport (viewer denied the write tool)', async () => {
    const harness = await serve();
    const { client } = await connect(harness.url, await harness.issue('reader', ['viewer']));

    const denied = await client.callTool({ name: 'capture_memory', arguments: MEMORY_ARGS });
    expect(denied.isError).toBe(true);
    expect(errorCode(denied)).toBe('FORBIDDEN');

    const allowed = await client.callTool({ name: 'search', arguments: { query: 'tokens' } });
    expect(allowed.isError).toBeFalsy();
  });

  it('meters quotas per principal over the remote transport (RATE_LIMITED)', async () => {
    const harness = await serve({
      quota: createInMemoryQuotaLimiter({ limit: 2, windowMs: 60_000, now: () => 0 }),
    });
    const { client } = await connect(harness.url, await harness.issue('agent', ['viewer']));

    await client.callTool({ name: 'search', arguments: { query: 'a' } });
    await client.callTool({ name: 'search', arguments: { query: 'b' } });

    const limited = await client.callTool({ name: 'search', arguments: { query: 'c' } });
    expect(limited.isError).toBe(true);
    expect(errorCode(limited)).toBe('RATE_LIMITED');
  });

  it('audits every remote call into the same trail REST records into', async () => {
    const audit = createInMemoryAuditLog();
    const harness = await serve({ audit });
    const { client } = await connect(harness.url, await harness.issue('agent', ['member']));

    await client.callTool({ name: 'capture_memory', arguments: MEMORY_ARGS });

    const { events } = await audit.forTenant('acme').query();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      tenantId: 'acme',
      actor: { principalId: 'agent', kind: 'token' },
      action: 'memory.write',
      target: 'capture_memory',
      outcome: 'success',
      metadata: { surface: 'mcp' },
    });
  });

  it('stops serving a token revoked mid-session, without the client reconnecting', async () => {
    const harness = await serve();
    const { token, record } = await harness.tokenStore.issue({
      tenantId: 'acme',
      principalId: 'agent',
      roles: ['member'],
    });
    const { client } = await connect(harness.url, token);
    expect(
      (await client.callTool({ name: 'search', arguments: { query: 'a' } })).isError,
    ).toBeFalsy();

    await harness.tokenStore.revoke(record.id);

    // The boundary re-authenticates every request, so the next call fails at the transport layer.
    await expect(client.callTool({ name: 'search', arguments: { query: 'b' } })).rejects.toThrow();
  });

  describe('per-call project selection (X-Tessera-Project — FR-66, ADR-0037)', () => {
    // This header has been read by the tool handlers since F-050, but no transport could carry it:
    // stdio has no per-call headers. This is the first test in the repo that can prove it works.
    it('rejects an unknown project rather than silently scoping to the default', async () => {
      const harness = await serve();
      const { client } = await connect(harness.url, await harness.issue('agent', ['member']), {
        'x-tessera-project': 'no-such-project',
      });

      const result = await client.callTool({ name: 'search', arguments: { query: 'a' } });
      expect(result.isError).toBe(true);
      expect(errorCode(result)).toBe('NOT_FOUND');
    });

    it('scopes a data tool to a project the tenant owns', async () => {
      const harness = await serve();
      const token = await harness.issue('agent', ['member']);

      // Create the project through the same surface, so it lands in the harness' own services.
      const { client: control } = await connect(harness.url, token);
      const created = await control.callTool({
        name: 'create_project',
        arguments: { name: 'beta' },
      });
      expect(created.isError).toBeFalsy();
      const projectId = (created.structuredContent as { id: string }).id;
      expect(projectId).toBeTruthy();

      const { client } = await connect(harness.url, token, { 'x-tessera-project': projectId });
      const result = await client.callTool({
        name: 'search',
        arguments: { query: 'authentication' },
      });
      expect(result.isError).toBeFalsy();
    });
  });

  describe('teardown under real client disconnect', () => {
    it('drops the session when the client terminates it explicitly', async () => {
      const harness = await serve();
      const { transport } = await connect(harness.url, await harness.issue('agent', ['member']));
      expect(harness.handler.sessionCount).toBe(1);

      await transport.terminateSession();
      expect(harness.handler.sessionCount).toBe(0);
    });

    it('LEAKS a session when the client only calls close() — which is why the sweep exists', async () => {
      let clock = 0;
      const harness = await serve({ sessionTtlMs: 1000, now: () => clock });
      const { client } = await connect(harness.url, await harness.issue('agent', ['member']));
      expect(harness.handler.sessionCount).toBe(1);

      await client.close();

      // The SDK client sends no DELETE on close(); only terminateSession() does. So the session is
      // still here, and no amount of client-side politeness will remove it...
      expect(harness.handler.sessionCount).toBe(1);
      await harness.handler.sweep();
      expect(harness.handler.sessionCount).toBe(1); // ...not even a sweep, until it is actually idle

      // ...only the idle sweep does. Without it, every agent that simply exits would strand an
      // McpServer here forever.
      clock = 1001;
      await harness.handler.sweep();
      expect(harness.handler.sessionCount).toBe(0);
    });

    it('close() releases every live session while a client is still connected', async () => {
      const harness = await serve();
      await connect(harness.url, await harness.issue('a', ['member']));
      await connect(harness.url, await harness.issue('b', ['member']));
      expect(harness.handler.sessionCount).toBe(2);

      await harness.handler.close();
      expect(harness.handler.sessionCount).toBe(0);
    });
  });
});
