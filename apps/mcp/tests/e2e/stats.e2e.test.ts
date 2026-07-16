import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  buildServer,
  createInMemoryTokenStore,
  createTokenAuthProvider,
  type ApiServices,
  type Role,
} from '@tessera/api';
import type { WorkspaceStats } from '@tessera/api/stats';
import { buildMcpServer, createMcpGateway } from '../../src/index';
import { createInMemoryServices } from './support/in-memory-services';

/** `get_stats` over a REAL MCP client, incl. ADR-0036 parity with `GET /v1/stats` (F-060). */
describe('@tessera/mcp get_stats', () => {
  let clients: Client[] = [];
  let servers: ReturnType<typeof buildMcpServer>[] = [];
  let repo: string;

  beforeAll(async () => {
    repo = await mkdtemp(join(tmpdir(), 'tessera-mcp-stats-'));
    await mkdir(join(repo, 'src'), { recursive: true });
    await writeFile(join(repo, 'README.md'), '# Repo\n\nHello.\n');
    await writeFile(join(repo, 'src', 'a.ts'), 'export const a = 1;\n');
  });

  afterAll(async () => {
    await rm(repo, { recursive: true, force: true });
  });

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

  function structured<T>(result: { structuredContent?: unknown }): T {
    return (result.structuredContent ?? {}) as T;
  }

  it('reports the workspace summary to a zero-auth local agent', async () => {
    const services = await createInMemoryServices();
    const client = await connect(buildMcpServer(services));

    const stats = structured<WorkspaceStats>(
      await client.callTool({ name: 'get_stats', arguments: {} }),
    );
    // The fixture seeds a real graph; nothing else exists yet.
    expect(stats.memories).toBe(0);
    expect(stats.sources).toBe(0);
    expect(stats.lastScanAt).toBeNull();
    expect(stats.graph.nodes).toBeGreaterThan(0);
  });

  it('is listed as an available tool', async () => {
    const services = await createInMemoryServices();
    const client = await connect(buildMcpServer(services));
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toContain('get_stats');
  });

  it('returns the SAME numbers as GET /v1/stats for the same tenant (ADR-0036 parity)', async () => {
    // One services object behind both surfaces — the same engine, exactly as a real deployment.
    const services: ApiServices = await createInMemoryServices();
    const tokenStore = createInMemoryTokenStore();
    const { token } = await tokenStore.issue({
      tenantId: 'acme',
      principalId: 'agent',
      roles: ['owner'] as Role[],
    });
    const auth = createTokenAuthProvider({ tokenStore });

    const rest = buildServer(services, { auth });
    await rest.ready();
    const mcp = await connect(
      buildMcpServer(services, {
        gateway: createMcpGateway({
          auth,
          resolveCredential: () => ({ authorization: `Bearer ${token}`, headers: {} }),
        }),
      }),
    );

    try {
      // Give the workspace real content through the agent surface.
      await mcp.callTool({
        name: 'add_source',
        arguments: { kind: 'filesystem', root: repo },
      });
      const sources = structured<{ sources: { id: string }[] }>(
        await mcp.callTool({ name: 'list_sources', arguments: {} }),
      );
      await mcp.callTool({ name: 'scan_source', arguments: { id: sources.sources[0]!.id } });
      await mcp.callTool({
        name: 'capture_memory',
        arguments: { kind: 'decision', title: 'Parity holds', body: 'One engine, two surfaces.' },
      });

      const fromMcp = structured<WorkspaceStats>(
        await mcp.callTool({ name: 'get_stats', arguments: {} }),
      );
      const fromRest = (
        await rest.inject({
          method: 'GET',
          url: '/v1/stats',
          headers: { authorization: `Bearer ${token}` },
        })
      ).json() as WorkspaceStats;

      // Not merely "both non-zero" — byte-identical, and provably about real content.
      expect(fromMcp).toEqual(fromRest);
      expect(fromRest.documents).toBe(2);
      expect(fromRest.memories).toBe(1);
      expect(fromRest.sources).toBe(1);
    } finally {
      await rest.close();
    }
  });

  it('denies an agent whose token lacks stats:read', async () => {
    const services = await createInMemoryServices();
    const tokenStore = createInMemoryTokenStore();
    const { token } = await tokenStore.issue({
      tenantId: 'acme',
      principalId: 'scoped-agent',
      roles: ['owner'] as Role[],
      scopes: ['memory:write'],
    });
    const client = await connect(
      buildMcpServer(services, {
        gateway: createMcpGateway({
          auth: createTokenAuthProvider({ tokenStore }),
          resolveCredential: () => ({ authorization: `Bearer ${token}`, headers: {} }),
        }),
      }),
    );

    const result = await client.callTool({ name: 'get_stats', arguments: {} });
    expect(result.isError).toBe(true);
  });
});
