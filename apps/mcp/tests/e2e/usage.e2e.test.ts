import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it } from 'vitest';
import { createInMemoryUsageStore, type UsageStore } from '@tessera/billing';
import { buildMcpServer } from '../../src/index';
import { createInMemoryServices } from './support/in-memory-services';

/**
 * **F-057 increment 5** — the MCP metering boundary (NFR-12, ADR-0060 §5).
 *
 * The agent surface is the population the entitlement exists to meter, and it runs with **no gateway**
 * in a stdio deployment — which is precisely why metering lives around the service call rather than in
 * `McpGateway.guard`. These tests run ungated for that reason.
 */
const WINDOW = { from: '2026-01-01', until: '2036-12-31' } as const;

describe('@tessera/mcp usage metering (F-057)', () => {
  let clients: Client[] = [];
  let servers: ReturnType<typeof buildMcpServer>[] = [];

  afterEach(async () => {
    await Promise.all(clients.map((client) => client.close()));
    await Promise.all(servers.map((server) => server.close()));
    clients = [];
    servers = [];
  });

  async function connect(usage: UsageStore): Promise<Client> {
    const services = await createInMemoryServices();
    // No gateway, deliberately: a stdio deployment has none, and it must still meter.
    const server = buildMcpServer(services, { usage });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);
    servers.push(server);
    clients.push(client);
    return client;
  }

  const countOf = async (usage: UsageStore, operation: string): Promise<number> => {
    const summary = await usage.summarize({ tenantId: 'default', ...WINDOW });
    return summary.find((aggregate) => aggregate.operation === operation)?.count ?? 0;
  };

  it('records one compile bucket per compile_context call, with the package tokens', async () => {
    const usage = createInMemoryUsageStore();
    const client = await connect(usage);

    const result = await client.callTool({
      name: 'compile_context',
      arguments: { task: 'meter this compile', budget: 2000 },
    });
    const pkg = result.structuredContent as { totalTokens: number };

    const summary = await usage.summarize({ tenantId: 'default', ...WINDOW });
    const compile = summary.find((aggregate) => aggregate.operation === 'compile');
    expect(compile?.count).toBe(1);
    expect(compile?.tokens).toBe(pkg.totalTokens);
    expect(compile?.scoredCount).toBe(1);
  });

  it('meters `explain` as a compile — it spends the same resource', async () => {
    // Exempting the diagnostic path would leave a free, unmetered way to compile: a hole in the
    // entitlement rather than a courtesy. Mutation check: removing the meter from `explain` turns
    // this red.
    const usage = createInMemoryUsageStore();
    const client = await connect(usage);

    await client.callTool({ name: 'explain', arguments: { task: 'why these fragments' } });

    expect(await countOf(usage, 'compile')).toBe(1);
  });

  it('meters search', async () => {
    const usage = createInMemoryUsageStore();
    const client = await connect(usage);

    await client.callTool({ name: 'search', arguments: { query: 'anything' } });

    expect(await countOf(usage, 'search')).toBe(1);
  });

  it('does not meter a tool that spends nothing', async () => {
    // `get_stats` reads workspace state. Metering every tool call would turn a status poll into
    // billable usage, which is how an agent surface becomes hostile to poll.
    const usage = createInMemoryUsageStore();
    const client = await connect(usage);

    await client.callTool({ name: 'get_stats', arguments: {} });

    expect(await usage.summarize({ tenantId: 'default', ...WINDOW })).toEqual([]);
  });

  it('answers the call even when the usage store is broken', async () => {
    // Failure isolation, same rule as the REST hook: a metering outage must not become a tool outage.
    const broken: UsageStore = {
      record: () => Promise.reject(new Error('usage store is down')),
      summarize: () => Promise.resolve([]),
      daily: () => Promise.resolve([]),
      earliestDay: () => Promise.resolve(null),
    };
    const client = await connect(broken);

    const result = await client.callTool({
      name: 'search',
      arguments: { query: 'still works' },
    });
    expect(result.isError).toBeFalsy();
  });

  it('runs unmetered when no store is wired', async () => {
    const services = await createInMemoryServices();
    const server = buildMcpServer(services);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);
    servers.push(server);
    clients.push(client);

    const result = await client.callTool({
      name: 'compile_context',
      arguments: { task: 'unmetered', budget: 1000 },
    });
    expect(result.isError).toBeFalsy();
  });
});
