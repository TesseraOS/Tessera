import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createInMemoryAuditLog,
  createInMemoryTokenStore,
  createTokenAuthProvider,
  type AuditLog,
  type Role,
} from '@tessera/api';
import {
  buildMcpServer,
  createInMemoryQuotaLimiter,
  createMcpGateway,
  type QuotaLimiter,
} from '../../src/index';
import { createInMemoryServices } from './support/in-memory-services';

/**
 * Drive the gated MCP surface through a REAL MCP client over a linked in-memory transport (FR-36).
 * The gateway reuses the real F-025 token AuthProvider; a fixed credential resolver stands in for the
 * one client identity a stdio connection carries.
 */
describe('@tessera/mcp gateway (auth + quotas)', () => {
  let clients: Client[] = [];
  let servers: ReturnType<typeof buildMcpServer>[] = [];

  afterEach(async () => {
    await Promise.all(clients.map((client) => client.close()));
    await Promise.all(servers.map((server) => server.close()));
    clients = [];
    servers = [];
  });

  async function connect(server: ReturnType<typeof buildMcpServer>): Promise<Client> {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);
    servers.push(server);
    clients.push(client);
    return client;
  }

  async function gatedClient(opts: {
    roles: Role[];
    quota?: QuotaLimiter;
    audit?: AuditLog;
  }): Promise<Client> {
    const services = await createInMemoryServices();
    const tokenStore = createInMemoryTokenStore();
    const { token } = await tokenStore.issue({
      tenantId: 'acme',
      principalId: 'client',
      roles: opts.roles,
    });
    const gateway = createMcpGateway({
      auth: createTokenAuthProvider({ tokenStore }),
      ...(opts.quota !== undefined ? { quota: opts.quota } : {}),
      ...(opts.audit !== undefined ? { audit: opts.audit } : {}),
      resolveCredential: () => ({ authorization: `Bearer ${token}`, headers: {} }),
    });
    return connect(buildMcpServer(services, { gateway }));
  }

  function errorCode(result: { structuredContent?: unknown }): string | undefined {
    const structured = (result.structuredContent ?? {}) as { error?: { code?: string } };
    return structured.error?.code;
  }

  const MEMORY_ARGS = { kind: 'decision', title: 'Adopt X', body: 'We will adopt X because Y.' };

  it('denies a viewer the write tool (FORBIDDEN) but allows reads', async () => {
    const client = await gatedClient({ roles: ['viewer'] });

    const denied = await client.callTool({ name: 'capture_memory', arguments: MEMORY_ARGS });
    expect(denied.isError).toBe(true);
    expect(errorCode(denied)).toBe('FORBIDDEN');

    const allowed = await client.callTool({
      name: 'search',
      arguments: { query: 'authentication tokens' },
    });
    expect(allowed.isError).toBeFalsy();
  });

  it('allows a member the write tool', async () => {
    const client = await gatedClient({ roles: ['member'] });
    const result = await client.callTool({ name: 'capture_memory', arguments: MEMORY_ARGS });
    expect(result.isError).toBeFalsy();
  });

  it('rate-limits a principal once its quota is exhausted (RATE_LIMITED)', async () => {
    const quota = createInMemoryQuotaLimiter({ limit: 2, windowMs: 60_000, now: () => 0 });
    const client = await gatedClient({ roles: ['viewer'], quota });

    expect(
      (await client.callTool({ name: 'search', arguments: { query: 'a' } })).isError,
    ).toBeFalsy();
    expect(
      (await client.callTool({ name: 'search', arguments: { query: 'b' } })).isError,
    ).toBeFalsy();

    const limited = await client.callTool({ name: 'search', arguments: { query: 'c' } });
    expect(limited.isError).toBe(true);
    expect(errorCode(limited)).toBe('RATE_LIMITED');
  });

  it('leaves all tools open when no gateway is configured (back-compat)', async () => {
    const services = await createInMemoryServices();
    const client = await connect(buildMcpServer(services));
    const result = await client.callTool({ name: 'capture_memory', arguments: MEMORY_ARGS });
    expect(result.isError).toBeFalsy();
  });

  describe('audit recording (F-047 — closes the F-027 seam)', () => {
    it('records a real agent tool call into the same trail REST records into', async () => {
      const audit = createInMemoryAuditLog();
      const client = await gatedClient({ roles: ['member'], audit });

      const result = await client.callTool({ name: 'capture_memory', arguments: MEMORY_ARGS });
      expect(result.isError).toBeFalsy();

      const { events } = await audit.forTenant('acme').query();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        tenantId: 'acme',
        actor: { principalId: 'client', kind: 'token' },
        action: 'memory.write',
        target: 'capture_memory',
        outcome: 'success',
        metadata: { surface: 'mcp' },
      });
    });

    it('records a denied tool call from a real client as `denied`', async () => {
      const audit = createInMemoryAuditLog();
      const client = await gatedClient({ roles: ['viewer'], audit });

      const denied = await client.callTool({ name: 'capture_memory', arguments: MEMORY_ARGS });
      expect(errorCode(denied)).toBe('FORBIDDEN');

      const { events } = await audit.forTenant('acme').query();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        action: 'memory.write',
        target: 'capture_memory',
        outcome: 'denied',
      });
    });

    it('records nothing when no audit sink is wired (back-compat)', async () => {
      const client = await gatedClient({ roles: ['member'] });
      const result = await client.callTool({ name: 'capture_memory', arguments: MEMORY_ARGS });
      expect(result.isError).toBeFalsy(); // unchanged behavior without a sink
    });
  });
});
