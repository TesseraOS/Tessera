import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildServer,
  createInMemoryAuditLog,
  createInMemoryNotificationStore,
  createInMemoryTokenStore,
  createTokenAuthProvider,
  type ApiServices,
  type AuditLog,
  type NotificationStore,
  type TokenStore,
} from '../../src/index';
import { createInMemoryServices } from './support/in-memory-services';

const MEMORY_BODY = { kind: 'decision', title: 'Adopt X', body: 'We will adopt X because Y.' };

interface NotificationShape {
  id: string;
  kind: string;
  severity: string;
  at: string;
  read: boolean;
  actor: { principalId: string };
}

/** End-to-end notification centre over the HTTP surface (F-065; FR-38/FR-49, ADR-0064). */
describe('@tessera/api notifications', () => {
  let services: ApiServices;
  let audit: AuditLog;
  let notifications: NotificationStore;

  beforeEach(async () => {
    services = await createInMemoryServices();
    audit = createInMemoryAuditLog();
    notifications = createInMemoryNotificationStore();
  });

  describe('default build (zero-auth Local provider)', () => {
    let app: ReturnType<typeof buildServer>;

    beforeEach(async () => {
      app = buildServer(services, { audit, notifications });
      await app.ready();
    });
    afterEach(async () => {
      await app.close();
    });

    const list = async (
      query = '',
    ): Promise<{
      notifications: NotificationShape[];
      unreadCount: number;
      nextCursor?: string;
    }> => {
      const res = await app.inject({ method: 'GET', url: `/v1/notifications${query}` });
      expect(res.statusCode).toBe(200);
      return res.json();
    };

    it('projects a captured memory into a notification, unread', async () => {
      const created = await app.inject({ method: 'POST', url: '/v1/memory', payload: MEMORY_BODY });
      expect(created.statusCode).toBe(201);

      const page = await list();
      expect(page.notifications).toHaveLength(1);
      expect(page.notifications[0]).toMatchObject({
        kind: 'memory.captured',
        severity: 'info',
        read: false,
      });
      expect(page.unreadCount).toBe(1);
    });

    it('carries no rendered message text — the kind is the message', async () => {
      await app.inject({ method: 'POST', url: '/v1/memory', payload: MEMORY_BODY });
      const page = await list();
      // A server-rendered English sentence would be untranslatable for the dashboard and wasted
      // tokens for an agent. If one is ever added, this fails and the decision gets re-made.
      expect(Object.keys(page.notifications[0] ?? {}).sort()).toEqual([
        'actor',
        'at',
        'id',
        'kind',
        'read',
        'severity',
        'target',
      ]);
    });

    it('marks one read, and the mark survives into a later request', async () => {
      await app.inject({ method: 'POST', url: '/v1/memory', payload: MEMORY_BODY });
      const [first] = (await list()).notifications;

      const marked = await app.inject({
        method: 'POST',
        url: '/v1/notifications/read',
        payload: { ids: [first!.id] },
      });
      expect(marked.statusCode).toBe(200);
      expect(marked.json().unreadCount).toBe(0);

      const after = await list();
      expect(after.notifications[0]?.read).toBe(true);
      expect(after.unreadCount).toBe(0);
      expect((await list('?unread=true')).notifications).toEqual([]);
    });

    it('marks all read from the STORE’s newest instant, not the client’s page', async () => {
      await app.inject({ method: 'POST', url: '/v1/memory', payload: MEMORY_BODY });
      await app.inject({ method: 'POST', url: '/v1/memory', payload: MEMORY_BODY });

      const res = await app.inject({
        method: 'POST',
        url: '/v1/notifications/read-all',
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      const newest = (await list()).notifications[0]!;
      expect(res.json().watermark).toBe(newest.at);
      expect(res.json().unreadCount).toBe(0);
    });

    it('answers mark-all-read on an empty workspace without inventing a watermark', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/notifications/read-all',
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ watermark: null, readIds: [], unreadCount: 0 });
    });

    it('merges preference updates, and a muted kind leaves the list and the badge', async () => {
      await app.inject({ method: 'POST', url: '/v1/memory', payload: MEMORY_BODY });
      expect((await list()).unreadCount).toBe(1);

      const put = await app.inject({
        method: 'PUT',
        url: '/v1/notifications/preferences',
        payload: { 'memory.captured': false },
      });
      expect(put.statusCode).toBe(200);
      expect(put.json().preferences).toMatchObject({
        'memory.captured': false,
        // Untouched kinds keep their default — a partial update must not mute by omission.
        'scan.failed': true,
      });

      const page = await list();
      expect(page.notifications).toEqual([]);
      expect(page.unreadCount).toBe(0);
    });

    it('rejects an empty preference body rather than silently doing nothing', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/v1/notifications/preferences',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it('audits a preference write but NOT a list read', async () => {
      await app.inject({ method: 'GET', url: '/v1/notifications' });
      await app.inject({ method: 'GET', url: '/v1/notifications/preferences' });
      expect((await audit.query({ action: 'notification.read' })).events).toEqual([]);
      expect((await audit.query({ action: 'notification.manage' })).events).toEqual([]);

      await app.inject({
        method: 'PUT',
        url: '/v1/notifications/preferences',
        payload: { 'plan.changed': false },
      });
      // "Who turned off an alert, and when?" must be answerable; "who opened the bell" must not
      // flood the trail it reads from.
      expect((await audit.query({ action: 'notification.manage' })).events).toHaveLength(1);
    });

    it('filters by kind and by severity', async () => {
      await app.inject({ method: 'POST', url: '/v1/memory', payload: MEMORY_BODY });
      expect((await list('?kind=memory.captured')).notifications).toHaveLength(1);
      expect((await list('?kind=scan.failed')).notifications).toEqual([]);
      expect((await list('?severity=error')).notifications).toEqual([]);
      expect((await list('?severity=info')).notifications).toHaveLength(1);
    });

    it('rejects an unknown kind at the boundary', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/notifications?kind=nope' });
      expect(res.statusCode).toBe(400);
    });

    it('erases notification state on DSR delete, unlike the retained trail', async () => {
      await app.inject({ method: 'POST', url: '/v1/memory', payload: MEMORY_BODY });
      const [first] = (await list()).notifications;
      await app.inject({
        method: 'POST',
        url: '/v1/notifications/read',
        payload: { ids: [first!.id] },
      });
      await app.inject({
        method: 'PUT',
        url: '/v1/notifications/preferences',
        payload: { 'plan.changed': false },
      });

      const erased = await app.inject({ method: 'POST', url: '/v1/dsr/delete' });
      expect(erased.statusCode).toBe(200);
      expect(erased.json().notifications).toBe(1);

      const prefs = await app.inject({ method: 'GET', url: '/v1/notifications/preferences' });
      expect(prefs.json().preferences['plan.changed']).toBe(true);
    });
  });

  describe('token provider build (RBAC + tenancy)', () => {
    let app: ReturnType<typeof buildServer>;
    let tokenStore: TokenStore;

    beforeEach(async () => {
      tokenStore = createInMemoryTokenStore();
      app = buildServer(services, {
        auth: createTokenAuthProvider({ tokenStore }),
        audit,
        notifications,
      });
      await app.ready();
    });
    afterEach(async () => {
      await app.close();
    });

    async function token(
      tenantId: string,
      principalId: string,
      roles: readonly string[],
    ): Promise<string> {
      const { token: t } = await tokenStore.issue({ tenantId, principalId, roles: roles as never });
      return t;
    }

    const listAs = async (
      bearer: string,
    ): Promise<{ notifications: NotificationShape[]; unreadCount: number }> => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/notifications',
        headers: { authorization: `Bearer ${bearer}` },
      });
      expect(res.statusCode).toBe(200);
      return res.json();
    };

    it('gives two principals in ONE tenant independent read state', async () => {
      const writer = await token('acme', 'writer-1', ['member']);
      const reader = await token('acme', 'reader-1', ['viewer']);

      await app.inject({
        method: 'POST',
        url: '/v1/memory',
        payload: MEMORY_BODY,
        headers: { authorization: `Bearer ${writer}` },
      });

      const [shared] = (await listAs(writer)).notifications;
      const marked = await app.inject({
        method: 'POST',
        url: '/v1/notifications/read',
        payload: { ids: [shared!.id] },
        headers: { authorization: `Bearer ${writer}` },
      });
      expect(marked.statusCode).toBe(200);

      // The notification is the workspace's; the mark is one person's. A shared workspace is not a
      // shared inbox — clearing your badge must not clear a colleague's.
      const asReader = await listAs(reader);
      expect(asReader.notifications[0]?.id).toBe(shared!.id);
      expect(asReader.notifications[0]?.read).toBe(false);
      expect(asReader.unreadCount).toBe(1);
    });

    it('lets a VIEWER read and clear their own notifications', async () => {
      const writer = await token('acme', 'writer-1', ['member']);
      const reader = await token('acme', 'reader-1', ['viewer']);
      await app.inject({
        method: 'POST',
        url: '/v1/memory',
        payload: MEMORY_BODY,
        headers: { authorization: `Bearer ${writer}` },
      });

      // A read mark is self-scoped, so it needs authentication and nothing more: requiring a write
      // permission would leave a viewer able to see a badge but never clear it.
      const cleared = await app.inject({
        method: 'POST',
        url: '/v1/notifications/read-all',
        payload: {},
        headers: { authorization: `Bearer ${reader}` },
      });
      expect(cleared.statusCode).toBe(200);
      expect((await listAs(reader)).unreadCount).toBe(0);
      expect((await listAs(writer)).unreadCount).toBe(1);
    });

    it('isolates tenants — one workspace never projects into another', async () => {
      const acme = await token('acme', 'writer-1', ['member']);
      const globex = await token('globex', 'writer-2', ['member']);

      await app.inject({
        method: 'POST',
        url: '/v1/memory',
        payload: MEMORY_BODY,
        headers: { authorization: `Bearer ${acme}` },
      });

      expect((await listAs(acme)).notifications).toHaveLength(1);
      expect((await listAs(globex)).notifications).toEqual([]);
    });

    it('401s an unauthenticated caller', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/notifications' });
      expect(res.statusCode).toBe(401);
    });
  });
});
