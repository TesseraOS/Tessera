import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createInMemoryTokenStore, type TokenStore } from '@tessera/api/auth';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildMcpServer } from '../../src/index';
import { createInMemoryServices } from './support/in-memory-services';

/** Token-management tools over a REAL MCP client (F-046; ADR-0036 parity with REST /v1/tokens). */
describe('@tessera/mcp token tools', () => {
  let client: Client;
  let server: ReturnType<typeof buildMcpServer>;
  let tokenStore: TokenStore;

  beforeEach(async () => {
    const services = await createInMemoryServices();
    tokenStore = createInMemoryTokenStore();
    server = buildMcpServer(services, { tokenStore });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  function structured(result: { structuredContent?: unknown }): Record<string, unknown> {
    return (result.structuredContent ?? {}) as Record<string, unknown>;
  }

  it('issues (secret once), lists, and revokes a token', async () => {
    const issued = await client.callTool({
      name: 'issue_token',
      arguments: { principalId: 'ci-bot', roles: ['member'], displayName: 'CI' },
    });
    expect(issued.isError).toBeFalsy();
    const created = structured(issued);
    expect(created.secret as string).toMatch(/^tsk_/);
    const token = created.token as { id: string; active: boolean };
    expect(token.active).toBe(true);

    // The issued secret resolves through the same store.
    expect(await tokenStore.verify(created.secret as string)).not.toBeNull();

    const listed = await client.callTool({ name: 'list_tokens', arguments: {} });
    const tokens = structured(listed).tokens as { id: string }[];
    expect(tokens.some((t) => t.id === token.id)).toBe(true);
    // No secret ever appears in the list.
    expect(JSON.stringify(structured(listed))).not.toContain(created.secret as string);

    const revoked = await client.callTool({
      name: 'revoke_token',
      arguments: { id: token.id },
    });
    expect(structured(revoked)).toMatchObject({ id: token.id, revoked: true });
    expect(await tokenStore.verify(created.secret as string)).toBeNull();
  });

  it('errors cleanly when no token store is wired', async () => {
    const services = await createInMemoryServices();
    const bare = buildMcpServer(services); // no tokenStore
    const [c, s] = InMemoryTransport.createLinkedPair();
    await bare.connect(s);
    const bareClient = new Client({ name: 'x', version: '0.0.0' });
    await bareClient.connect(c);

    const res = await bareClient.callTool({ name: 'list_tokens', arguments: {} });
    expect(res.isError).toBe(true);

    await bareClient.close();
    await bare.close();
  });
});
