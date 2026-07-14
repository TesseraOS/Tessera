import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildServer,
  createInMemoryTokenStore,
  createTokenAuthProvider,
  type ApiServices,
  type TokenStore,
} from '../../src/index';
import { createInMemoryServices } from './support/in-memory-services';

/** E2E for `GET /v1/me` — the identity projection that backs the dashboard session (F-045). */
describe('@tessera/api GET /v1/me', () => {
  let services: ApiServices;

  beforeEach(async () => {
    services = await createInMemoryServices();
  });

  describe('zero-auth Local provider (default)', () => {
    let app: ReturnType<typeof buildServer>;
    beforeEach(async () => {
      app = buildServer(services);
      await app.ready();
    });
    afterEach(async () => {
      await app.close();
    });

    it('returns the full-access local principal + default tenant', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/me' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.principal).toMatchObject({ id: 'local', kind: 'local', roles: ['owner'] });
      expect(body.tenantId).toBe('default');
      expect(body.permissions).toContain('admin:manage');
      expect(body.permissions).toContain('memory:write');
    });
  });

  describe('token provider', () => {
    let app: ReturnType<typeof buildServer>;
    let tokenStore: TokenStore;
    beforeEach(async () => {
      tokenStore = createInMemoryTokenStore();
      app = buildServer(services, { auth: createTokenAuthProvider({ tokenStore }) });
      await app.ready();
    });
    afterEach(async () => {
      await app.close();
    });

    it('401s without a token', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/me' });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });

    it('returns the token principal, tenant, and effective permissions', async () => {
      const { token } = await tokenStore.issue({
        tenantId: 'acme',
        principalId: 'reader',
        roles: ['viewer'],
        displayName: 'Ada Reader',
      });
      const res = await app.inject({
        method: 'GET',
        url: '/v1/me',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.principal).toMatchObject({
        id: 'reader',
        kind: 'token',
        roles: ['viewer'],
        displayName: 'Ada Reader',
      });
      expect(body.tenantId).toBe('acme');
      // viewer is read-only — has reads, not writes/admin.
      expect(body.permissions).toContain('search:read');
      expect(body.permissions).not.toContain('memory:write');
      expect(body.permissions).not.toContain('admin:manage');
    });
  });
});
