import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildServer,
  createInMemoryAuditLog,
  createInMemoryTokenStore,
  createTokenAuthProvider,
  type ApiServices,
  type AuditLog,
  type TokenStore,
} from '../../src/index';
import { createInMemoryServices } from './support/in-memory-services';

const MEMORY_BODY = { kind: 'decision', title: 'Adopt X', body: 'We will adopt X because Y.' };

interface AuditEventShape {
  action: string;
  outcome: string;
  actor: { principalId: string };
  tenantId: string;
}

/** End-to-end audit trail over the HTTP surface (F-027; FR-55/NFR-13). */
describe('@tessera/api audit trail', () => {
  let services: ApiServices;
  let audit: AuditLog;

  beforeEach(async () => {
    services = await createInMemoryServices();
    audit = createInMemoryAuditLog();
  });

  describe('default build (zero-auth Local provider)', () => {
    let app: ReturnType<typeof buildServer>;
    beforeEach(async () => {
      app = buildServer(services, { audit });
      await app.ready();
    });
    afterEach(async () => {
      await app.close();
    });

    it('records a sensitive action and serves it from GET /v1/audit', async () => {
      const created = await app.inject({ method: 'POST', url: '/v1/memory', payload: MEMORY_BODY });
      expect(created.statusCode).toBe(201);

      const res = await app.inject({ method: 'GET', url: '/v1/audit' });
      expect(res.statusCode).toBe(200);
      const events = res.json().events as AuditEventShape[];
      const write = events.find((e) => e.action === 'memory.write');
      expect(write?.outcome).toBe('success');
      expect(write?.actor.principalId).toBe('local'); // the zero-auth Local principal
    });

    it('exports the whole filtered trail, following the cursor past one page', async () => {
      // More events than one page, so a single-page export would be visibly short.
      for (let i = 0; i < 12; i += 1) {
        await app.inject({ method: 'POST', url: '/v1/memory', payload: MEMORY_BODY });
      }

      const paged = await app.inject({ method: 'GET', url: '/v1/audit?limit=5' });
      expect(paged.json().nextCursor).toBeDefined(); // proves the trail exceeds one page

      const res = await app.inject({ method: 'GET', url: '/v1/audit/export?action=memory.write' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { count: number; truncated: boolean; events: AuditEventShape[] };

      // "The filtered view" means EVERY matching row, not the page the user happened to be on. A
      // compliance export of page 1 of 40 is worse than none, because it looks complete.
      expect(body.count).toBe(12);
      expect(body.events).toHaveLength(12);
      expect(body.events.every((e) => e.action === 'memory.write')).toBe(true);
      expect(body.truncated).toBe(false);
    });

    it('records the export in the trail it exported — the compliance loop closes', async () => {
      await app.inject({ method: 'POST', url: '/v1/memory', payload: MEMORY_BODY });
      await app.inject({ method: 'GET', url: '/v1/audit/export' });

      const trail = await app.inject({ method: 'GET', url: '/v1/audit?action=audit.export' });
      const events = trail.json().events as AuditEventShape[];

      // FR-55 names "exports" as an audited category. Paging /v1/audit client-side would have
      // recorded `audit.read` — indistinguishable from an admin scrolling, so "who took a copy of
      // the trail?" would be unanswerable. This is the whole reason the export is a server route.
      expect(events).toHaveLength(1);
      expect(events[0]?.outcome).toBe('success');
      expect(events[0]?.actor.principalId).toBe('local');
    });

    it('narrows the export by filters', async () => {
      await app.inject({ method: 'POST', url: '/v1/memory', payload: MEMORY_BODY });
      await app.inject({ method: 'GET', url: '/v1/audit' }); // an audit.read event

      const res = await app.inject({ method: 'GET', url: '/v1/audit/export?action=audit.read' });
      const body = res.json() as { events: AuditEventShape[] };
      expect(body.events.every((e) => e.action === 'audit.read')).toBe(true);
      expect(body.events.some((e) => e.action === 'memory.write')).toBe(false);
    });

    it('documents the export route in the OpenAPI spec', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/openapi.json' });
      const paths = Object.keys((res.json() as { paths: Record<string, unknown> }).paths);
      expect(paths).toContain('/v1/audit/export');
    });
  });

  describe('token provider build (RBAC + tenancy)', () => {
    let app: ReturnType<typeof buildServer>;
    let tokenStore: TokenStore;

    beforeEach(async () => {
      tokenStore = createInMemoryTokenStore();
      app = buildServer(services, { auth: createTokenAuthProvider({ tokenStore }), audit });
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

    it('records success + denied outcomes and only an admin may read the trail; tenants are isolated', async () => {
      const acmeAdmin = await token('acme', 'admin-1', ['admin']);
      const acmeMember = await token('acme', 'writer-1', ['member']);
      const acmeViewer = await token('acme', 'reader-1', ['viewer']);
      const globexAdmin = await token('globex', 'admin-2', ['admin']);

      // A member writes (success); a viewer is denied the write (403).
      const write = await app.inject({
        method: 'POST',
        url: '/v1/memory',
        payload: MEMORY_BODY,
        headers: { authorization: `Bearer ${acmeMember}` },
      });
      expect(write.statusCode).toBe(201);

      const denied = await app.inject({
        method: 'POST',
        url: '/v1/memory',
        payload: MEMORY_BODY,
        headers: { authorization: `Bearer ${acmeViewer}` },
      });
      expect(denied.statusCode).toBe(403);

      // A non-admin cannot read the trail.
      const forbidden = await app.inject({
        method: 'GET',
        url: '/v1/audit',
        headers: { authorization: `Bearer ${acmeMember}` },
      });
      expect(forbidden.statusCode).toBe(403);

      // The acme admin sees both acme memory.write events (one success, one denied).
      const acmeTrail = await app.inject({
        method: 'GET',
        url: '/v1/audit?action=memory.write',
        headers: { authorization: `Bearer ${acmeAdmin}` },
      });
      expect(acmeTrail.statusCode).toBe(200);
      const acmeEvents = acmeTrail.json().events as AuditEventShape[];
      expect(acmeEvents).toHaveLength(2);
      expect(acmeEvents.map((e) => e.outcome).sort()).toEqual(['denied', 'success']);
      expect(acmeEvents.every((e) => e.tenantId === 'acme')).toBe(true);

      // The globex admin sees NONE of acme's events (cross-tenant isolation, FR-52).
      const globexTrail = await app.inject({
        method: 'GET',
        url: '/v1/audit?action=memory.write',
        headers: { authorization: `Bearer ${globexAdmin}` },
      });
      expect(globexTrail.statusCode).toBe(200);
      expect(globexTrail.json().events).toEqual([]);
    });

    it('denies the export to a non-admin', async () => {
      const member = await token('acme', 'member-1', ['member']);
      const res = await app.inject({
        method: 'GET',
        url: '/v1/audit/export',
        headers: { authorization: `Bearer ${member}` },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    });

    it("one tenant's export contains nothing of another's", async () => {
      const acmeAdmin = await token('acme', 'acme-admin', ['admin']);
      const globexAdmin = await token('globex', 'globex-admin', ['admin']);

      await app.inject({
        method: 'POST',
        url: '/v1/memory',
        payload: MEMORY_BODY,
        headers: { authorization: `Bearer ${acmeAdmin}` },
      });

      const globexExport = await app.inject({
        method: 'GET',
        url: '/v1/audit/export',
        headers: { authorization: `Bearer ${globexAdmin}` },
      });
      const body = globexExport.json() as { events: AuditEventShape[] };

      // For a tenant-scoped surface a cross-tenant case is the PRIMARY case, not an edge one — a
      // single-tenant suite cannot see the bug (the lesson F-060's SSE leak taught). An export walks
      // the port in a loop, so an unscoped log here would exfiltrate the whole deployment's trail.
      expect(body.events.every((e) => e.tenantId === 'globex')).toBe(true);
      expect(body.events.some((e) => e.action === 'memory.write')).toBe(false);

      // ...and acme's own export does contain acme's write.
      const acmeExport = await app.inject({
        method: 'GET',
        url: '/v1/audit/export',
        headers: { authorization: `Bearer ${acmeAdmin}` },
      });
      const acmeBody = acmeExport.json() as { events: AuditEventShape[] };
      expect(acmeBody.events.some((e) => e.action === 'memory.write')).toBe(true);
      expect(acmeBody.events.every((e) => e.tenantId === 'acme')).toBe(true);
    });
  });
});
