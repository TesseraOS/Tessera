import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createInMemoryTokenStore, createTokenAuthProvider, type Role } from '@tessera/api';
import { buildMcpServer, createMcpGateway } from '../../src/index';
import { createInMemoryServices } from './support/in-memory-services';

/** Drive the source-management tools through a REAL MCP client over a linked in-memory transport (F-038). */
describe('@tessera/mcp source tools', () => {
  let clients: Client[] = [];
  let servers: ReturnType<typeof buildMcpServer>[] = [];
  let repo: string;

  beforeAll(async () => {
    repo = await mkdtemp(join(tmpdir(), 'tessera-mcp-src-'));
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

  async function gatedClient(roles: Role[]): Promise<Client> {
    const services = await createInMemoryServices();
    const tokenStore = createInMemoryTokenStore();
    const { token } = await tokenStore.issue({ tenantId: 'acme', principalId: 'client', roles });
    const gateway = createMcpGateway({
      auth: createTokenAuthProvider({ tokenStore }),
      resolveCredential: () => ({ authorization: `Bearer ${token}`, headers: {} }),
    });
    return connect(buildMcpServer(services, { gateway }));
  }

  function structured<T>(result: { structuredContent?: unknown }): T {
    return (result.structuredContent ?? {}) as T;
  }

  function errorCode(result: { structuredContent?: unknown }): string | undefined {
    return structured<{ error?: { code?: string } }>(result).error?.code;
  }

  it('registers, scans, and lists a source end-to-end (ungated)', async () => {
    const services = await createInMemoryServices();
    const client = await connect(buildMcpServer(services));

    const added = await client.callTool({
      name: 'add_source',
      arguments: { kind: 'filesystem', root: repo },
    });
    expect(added.isError).toBeFalsy();
    const source = structured<{ id: string; kind: string }>(added);
    expect(source.kind).toBe('filesystem');

    const scanned = await client.callTool({ name: 'scan_source', arguments: { id: source.id } });
    expect(scanned.isError).toBeFalsy();
    expect(structured<{ summary: { added: number } }>(scanned).summary.added).toBe(2);

    const listed = await client.callTool({ name: 'list_sources', arguments: {} });
    const sources = structured<{ sources: { id: string }[] }>(listed).sources;
    expect(sources.map((s) => s.id)).toEqual([source.id]);
  });

  it('denies a viewer add_source (FORBIDDEN) but allows list_sources', async () => {
    const client = await gatedClient(['viewer']);

    const denied = await client.callTool({
      name: 'add_source',
      arguments: { kind: 'filesystem', root: repo },
    });
    expect(denied.isError).toBe(true);
    expect(errorCode(denied)).toBe('FORBIDDEN');

    const listed = await client.callTool({ name: 'list_sources', arguments: {} });
    expect(listed.isError).toBeFalsy();
  });

  it('lets a member add + scan a source', async () => {
    const client = await gatedClient(['member']);
    const added = await client.callTool({
      name: 'add_source',
      arguments: { kind: 'filesystem', root: repo },
    });
    expect(added.isError).toBeFalsy();
    const { id } = structured<{ id: string }>(added);
    const scanned = await client.callTool({ name: 'scan_source', arguments: { id } });
    expect(scanned.isError).toBeFalsy();
  });
});
