import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it } from 'vitest';
import { buildServer, type ApiServices } from '@tessera/api';
import {
  createInMemoryUsageStore,
  createLocalBilling,
  entitlementsFor,
  type UsageStore,
} from '@tessera/billing';
import { buildMcpServer } from '../../src/index';
import { createInMemoryServices } from './support/in-memory-services';

/**
 * **F-057 increment 6b, MCP half.** The monthly compile entitlement must hold on the surface AGENTS
 * use, not only the one humans use — F-077 exists because the token clamp held on REST and was
 * simply absent here for two releases.
 *
 * The parity case at the bottom is the one that fails if either surface is extended without the
 * other, which is the whole point of building the guard once in `@tessera/billing`.
 */
const FREE_LIMIT = entitlementsFor('free').maxMonthlyCompiles;

async function seedCompiles(usage: UsageStore, count: number): Promise<void> {
  const occurredAt = new Date().toISOString();
  for (let index = 0; index < count; index += 1) {
    await usage.record({
      tenantId: 'default',
      projectId: 'default',
      operation: 'compile',
      occurredAt,
      durationMs: 5,
    });
  }
}

describe('@tessera/mcp monthly compile entitlement (F-035, F-057)', () => {
  let clients: Client[] = [];
  let servers: ReturnType<typeof buildMcpServer>[] = [];

  afterEach(async () => {
    await Promise.all(clients.map((client) => client.close()));
    await Promise.all(servers.map((server) => server.close()));
    clients = [];
    servers = [];
  });

  async function connect(
    services: ApiServices,
    options: { usage: UsageStore; metered?: boolean },
  ): Promise<Client> {
    const server = buildMcpServer(services, {
      usage: options.usage,
      metered: options.metered ?? true,
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);
    servers.push(server);
    clients.push(client);
    return client;
  }

  const meteredServices = async (): Promise<ApiServices> => ({
    ...(await createInMemoryServices()),
    billing: createLocalBilling(),
  });

  it('refuses compile_context with RATE_LIMITED once the entitlement is spent', async () => {
    const usage = createInMemoryUsageStore();
    await seedCompiles(usage, FREE_LIMIT);
    const client = await connect(await meteredServices(), { usage });

    const result = await client.callTool({
      name: 'compile_context',
      arguments: { task: 'over the line', budget: 2000 },
    });

    expect(result.isError).toBe(true);
    const { error } = result.structuredContent as {
      error: { code: string; details?: { limit: number; used: number } };
    };
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.details).toMatchObject({ limit: FREE_LIMIT, used: FREE_LIMIT });
  });

  it('refuses `explain` too — it compiles, so it spends the same entitlement', async () => {
    // Mutation check: removing the guard from `explain` turns this red, and leaves a tool that
    // compiles without ever being refused. An agent that hit the cap could simply switch tools.
    const usage = createInMemoryUsageStore();
    await seedCompiles(usage, FREE_LIMIT);
    const client = await connect(await meteredServices(), { usage });

    const result = await client.callTool({
      name: 'explain',
      arguments: { task: 'why these fragments' },
    });

    expect(result.isError).toBe(true);
    expect((result.structuredContent as { error: { code: string } }).error.code).toBe(
      'RATE_LIMITED',
    );
  });

  it('allows a compile below the entitlement', async () => {
    const usage = createInMemoryUsageStore();
    await seedCompiles(usage, FREE_LIMIT - 1);
    const client = await connect(await meteredServices(), { usage });

    const result = await client.callTool({
      name: 'compile_context',
      arguments: { task: 'within the plan', budget: 2000 },
    });
    expect(result.isError).toBeFalsy();
  });

  it('never refuses an unmetered deployment', async () => {
    const usage = createInMemoryUsageStore();
    await seedCompiles(usage, FREE_LIMIT * 3);
    const client = await connect(await meteredServices(), { usage, metered: false });

    const result = await client.callTool({
      name: 'compile_context',
      arguments: { task: 'self-hosted, unmetered', budget: 2000 },
    });
    expect(result.isError).toBeFalsy();
  });

  it('refuses the same tenant at the same count on REST and MCP alike', async () => {
    // The parity assertion. One implementation, two callers — this fails the moment somebody
    // extends the rule on one surface only, which is the failure F-077 was written to prevent.
    const usage = createInMemoryUsageStore();
    const services = await meteredServices();
    await seedCompiles(usage, FREE_LIMIT);

    const rest = buildServer(services, { usage, metered: true });
    await rest.ready();
    const mcp = await connect(services, { usage });

    try {
      const fromRest = await rest.inject({
        method: 'POST',
        url: '/v1/compile',
        payload: { task: 'over the line', budget: 2000 },
      });
      const fromMcp = await mcp.callTool({
        name: 'compile_context',
        arguments: { task: 'over the line', budget: 2000 },
      });

      expect(fromRest.statusCode).toBe(429);
      expect(fromRest.json().error.code).toBe('RATE_LIMITED');
      expect((fromMcp.structuredContent as { error: { code: string } }).error.code).toBe(
        'RATE_LIMITED',
      );
    } finally {
      await rest.close();
    }
  });
});
