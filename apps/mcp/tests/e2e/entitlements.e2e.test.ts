import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it } from 'vitest';
import { buildServer, type ApiServices } from '@tessera/api';
import { createLocalBilling, entitlementsFor } from '@tessera/billing';
import { buildMcpServer } from '../../src/index';
import { createInMemoryServices } from './support/in-memory-services';

/**
 * F-077: the MCP compile path must enforce the plan entitlement clamp (NFR-12), which it previously
 * ignored entirely — `toCompileRequest` forwarded `budget` verbatim, so an agent could request any
 * budget while `POST /v1/compile` capped the same tenant.
 *
 * The clamp applies on a METERED deployment (one that wired a BillingProvider); a self-hosted
 * deployment that wired none is unmetered and uncapped (ADR-0056), which the last block pins.
 */
describe('@tessera/mcp compile entitlements', () => {
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

  function structured<T>(result: { structuredContent?: unknown }): T {
    return (result.structuredContent ?? {}) as T;
  }

  /** A metered deployment: the local adapter reports a free subscription (8000-token cap). */
  async function meteredClient(): Promise<{ client: Client; services: ApiServices }> {
    const services: ApiServices = {
      ...(await createInMemoryServices()),
      billing: createLocalBilling(),
    };
    return { client: await connect(buildMcpServer(services, { metered: true })), services };
  }

  const FREE_CAP = entitlementsFor('free').maxTokensPerCompile;

  it('caps an over-plan compile budget (the F-077 bypass)', async () => {
    const { client } = await meteredClient();
    const pkg = structured<{ budget: number }>(
      await client.callTool({
        name: 'compile_context',
        arguments: { task: 'how does authentication work', budget: 50_000 },
      }),
    );
    // Before F-077 this returned 50000 — the requested budget, granted in full.
    expect(pkg.budget).toBe(FREE_CAP);
  });

  it('leaves a within-plan budget alone', async () => {
    const { client } = await meteredClient();
    const pkg = structured<{ budget: number }>(
      await client.callTool({
        name: 'compile_context',
        arguments: { task: 'how does authentication work', budget: 4_000 },
      }),
    );
    expect(pkg.budget).toBe(4_000);
  });

  it('caps `explain` too, and NAMES the clamp there (ADR-0056)', async () => {
    const { client } = await meteredClient();
    const explanation = structured<{
      budget: number;
      budgetClamp?: { requested: number; effective: number };
    }>(
      await client.callTool({
        name: 'explain',
        arguments: { task: 'how does authentication work', budget: 50_000 },
      }),
    );
    expect(explanation.budget).toBe(FREE_CAP);
    expect(explanation.budgetClamp).toEqual({ requested: 50_000, effective: FREE_CAP });
  });

  it('omits budgetClamp from `explain` when nothing was clamped', async () => {
    const { client } = await meteredClient();
    const explanation = structured<{ budgetClamp?: unknown }>(
      await client.callTool({
        name: 'explain',
        arguments: { task: 'how does authentication work', budget: 4_000 },
      }),
    );
    expect(explanation.budgetClamp).toBeUndefined();
  });

  it('REST and MCP resolve the SAME effective budget for one tenant (ADR-0036 parity)', async () => {
    // One services object behind both surfaces, exactly as a real deployment wires it — so this
    // fails if either surface is extended without the other, which is the whole point of F-077.
    const services: ApiServices = {
      ...(await createInMemoryServices()),
      billing: createLocalBilling(),
    };
    const rest = buildServer(services, { metered: true });
    await rest.ready();
    const mcp = await connect(buildMcpServer(services, { metered: true }));

    try {
      const payload = { task: 'how does authentication work', budget: 50_000 };
      const fromMcp = structured<{ budget: number }>(
        await mcp.callTool({ name: 'compile_context', arguments: payload }),
      );
      const fromRest = (
        await rest.inject({ method: 'POST', url: '/v1/compile', payload })
      ).json() as { budget: number };

      expect(fromMcp.budget).toBe(fromRest.budget);
      expect(fromRest.budget).toBe(FREE_CAP);
    } finally {
      await rest.close();
    }
  });

  it('does NOT cap an UNMETERED deployment that HAS a provider wired (ADR-0060 §1)', async () => {
    // The shape every runtime-composed Local and self-hosted deployment actually has. Under the old
    // "is a provider object present" predicate this was capped at 8000 on BOTH surfaces.
    const services: ApiServices = {
      ...(await createInMemoryServices()),
      billing: createLocalBilling(),
    };
    const client = await connect(buildMcpServer(services));
    const pkg = structured<{ budget: number }>(
      await client.callTool({
        name: 'compile_context',
        arguments: { task: 'how does authentication work', budget: 50_000 },
      }),
    );
    expect(pkg.budget).toBe(50_000);
  });

  it('does NOT cap a self-hosted deployment that wired no provider (ADR-0056)', async () => {
    const client = await connect(buildMcpServer(await createInMemoryServices()));
    const pkg = structured<{ budget: number }>(
      await client.callTool({
        name: 'compile_context',
        arguments: { task: 'how does authentication work', budget: 50_000 },
      }),
    );
    expect(pkg.budget).toBe(50_000);
  });
});
