import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createInMemoryAuditLog, createInMemoryNotificationStore } from '@tessera/api';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildMcpServer } from '../../src/index';
import { createInMemoryServices } from './support/in-memory-services';

/**
 * `list_notifications` (F-065) — the agent-readable half of the notification centre: "what changed
 * since my last session?"
 *
 * The parity that matters is not that the tool exists but that it reads the SAME read state the
 * dashboard writes (ADR-0036): an agent and a person looking at one workspace must not disagree
 * about what has been seen.
 */
describe('@tessera/mcp list_notifications', () => {
  let client: Client;
  let server: ReturnType<typeof buildMcpServer>;
  let audit: ReturnType<typeof createInMemoryAuditLog>;
  let notifications: ReturnType<typeof createInMemoryNotificationStore>;

  beforeEach(async () => {
    const services = await createInMemoryServices();
    audit = createInMemoryAuditLog();
    notifications = createInMemoryNotificationStore();
    server = buildMcpServer(services, { audit, notifications });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  function structured(result: { structuredContent?: unknown }): {
    notifications: { id: string; kind: string; severity: string; read: boolean }[];
    unreadCount: number;
  } {
    return (result.structuredContent ?? {}) as never;
  }

  /** Append a trail event the projection will pick up. */
  async function record(action: 'memory.write' | 'source.scan.failed'): Promise<void> {
    await audit.record({
      tenantId: 'default',
      actor: { principalId: 'agent-1', kind: 'token' },
      action,
      outcome: 'success',
    });
  }

  const call = async (args: Record<string, unknown> = {}): Promise<ReturnType<typeof structured>> =>
    structured(await client.callTool({ name: 'list_notifications', arguments: args }));

  it('reports what happened, typed by kind and severity', async () => {
    await record('memory.write');
    await record('source.scan.failed');

    const { notifications: rows, unreadCount } = await call();
    expect(rows.map((row) => row.kind)).toEqual(['scan.failed', 'memory.captured']);
    expect(rows[0]?.severity).toBe('error');
    expect(unreadCount).toBe(2);
  });

  it('shares read state with the dashboard — marking read in one clears it in the other', async () => {
    await record('memory.write');
    const [row] = (await call()).notifications;

    // What `POST /v1/notifications/read` writes, into the same store this tool reads.
    await notifications.forTenant('default').markRead('local', [row!.id]);

    const after = await call();
    expect(after.notifications[0]?.read).toBe(true);
    expect(after.unreadCount).toBe(0);
    expect((await call({ unreadOnly: true })).notifications).toEqual([]);
  });

  it('honours the principal’s preferences, so a muted kind is invisible to the agent too', async () => {
    await record('memory.write');
    await record('source.scan.failed');
    await notifications.forTenant('default').setPreferences('local', { 'scan.failed': false });

    const { notifications: rows } = await call();
    expect(rows.map((row) => row.kind)).toEqual(['memory.captured']);
  });

  it('filters by kind and severity', async () => {
    await record('memory.write');
    await record('source.scan.failed');

    expect((await call({ kind: ['scan.failed'] })).notifications).toHaveLength(1);
    expect((await call({ severity: 'info' })).notifications.map((r) => r.kind)).toEqual([
      'memory.captured',
    ]);
  });

  it('errors cleanly when the deployment wired no notification state', async () => {
    // Half-wiring is the failure worth naming: a notification is the JOIN of the trail and the read
    // state, so a server with only one of them can only answer half the question.
    const bare = buildMcpServer(await createInMemoryServices(), { audit });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await bare.connect(serverTransport);
    const bareClient = new Client({ name: 'test-client', version: '0.0.0' });
    await bareClient.connect(clientTransport);
    try {
      const result = await bareClient.callTool({ name: 'list_notifications', arguments: {} });
      expect(result.isError).toBe(true);
    } finally {
      await bareClient.close();
      await bare.close();
    }
  });
});
