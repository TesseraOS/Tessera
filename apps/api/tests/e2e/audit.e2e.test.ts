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
  });
});
