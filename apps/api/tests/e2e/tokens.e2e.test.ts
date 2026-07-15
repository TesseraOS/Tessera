import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildServer,
  createInMemoryTokenStore,
  createTokenAuthProvider,
  type ApiServices,
  type TokenStore,
} from '../../src/index';
import { createInMemoryServices } from './support/in-memory-services';

/** E2E for the API-token self-service + RBAC catalog (F-046). */
describe('@tessera/api /v1/tokens + /v1/rbac', () => {
  let services: ApiServices;
  beforeEach(async () => {
    services = await createInMemoryServices();
  });

  describe('token self-service (token mode)', () => {
    let app: ReturnType<typeof buildServer>;
    let tokenStore: TokenStore;
    let ownerAuth: { authorization: string };

    beforeEach(async () => {
      tokenStore = createInMemoryTokenStore();
      const { token } = await tokenStore.issue({
        tenantId: 'acme',
        principalId: 'admin',
        roles: ['owner'],
      });
      ownerAuth = { authorization: `Bearer ${token}` };
      app = buildServer(services, {
        auth: createTokenAuthProvider({ tokenStore }),
        tokenStore,
      });
      await app.ready();
    });
    afterEach(async () => {
      await app.close();
    });

    it('creates a token (secret once), lists it, the secret authenticates, then revoke 401s it', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/v1/tokens',
        headers: ownerAuth,
        payload: { principalId: 'ci-bot', roles: ['member'], displayName: 'CI bot' },
      });
      expect(created.statusCode).toBe(201);
      const body = created.json();
      expect(body.secret).toMatch(/^tsk_/);
      expect(body.token).toMatchObject({ principalId: 'ci-bot', active: true });
      expect(body.token.secret).toBeUndefined();
      const newId = body.token.id as string;
      const secret = body.secret as string;

      // The list never carries a secret.
      const list = await app.inject({ method: 'GET', url: '/v1/tokens', headers: ownerAuth });
      expect(list.statusCode).toBe(200);
      const listed = list.json().tokens.find((t: { id: string }) => t.id === newId);
      expect(listed).toBeDefined();
      expect(JSON.stringify(list.json())).not.toContain(secret);

      // The issued secret authenticates /v1/me as the new principal.
      const me = await app.inject({
        method: 'GET',
        url: '/v1/me',
        headers: { authorization: `Bearer ${secret}` },
      });
      expect(me.statusCode).toBe(200);
      expect(me.json().principal).toMatchObject({ id: 'ci-bot', kind: 'token' });

      // Revoke → the secret no longer authenticates.
      const revoked = await app.inject({
        method: 'DELETE',
        url: `/v1/tokens/${newId}`,
        headers: ownerAuth,
      });
      expect(revoked.statusCode).toBe(200);
      expect(revoked.json()).toMatchObject({ id: newId, revoked: true });

      const after = await app.inject({
        method: 'GET',
        url: '/v1/me',
        headers: { authorization: `Bearer ${secret}` },
      });
      expect(after.statusCode).toBe(401);
    });

    it('forbids issuing a token that exceeds the caller (least privilege)', async () => {
      // A viewer (read-only) cannot mint a member/owner token.
      const { token: viewerToken } = await tokenStore.issue({
        tenantId: 'acme',
        principalId: 'reader',
        roles: ['viewer'],
      });
      // viewer lacks admin:manage → 403 on the route guard itself.
      const denied = await app.inject({
        method: 'POST',
        url: '/v1/tokens',
        headers: { authorization: `Bearer ${viewerToken}` },
        payload: { principalId: 'x', roles: ['member'] },
      });
      expect(denied.statusCode).toBe(403);
    });

    it('requires admin:manage to list (a member is forbidden)', async () => {
      const { token: memberToken } = await tokenStore.issue({
        tenantId: 'acme',
        principalId: 'writer',
        roles: ['member'],
      });
      const res = await app.inject({
        method: 'GET',
        url: '/v1/tokens',
        headers: { authorization: `Bearer ${memberToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('404s revoking a token id from another tenant', async () => {
      const otherStoreId = (
        await tokenStore.issue({ tenantId: 'globex', principalId: 'x', roles: ['member'] })
      ).record.id;
      const res = await app.inject({
        method: 'DELETE',
        url: `/v1/tokens/${otherStoreId}`,
        headers: ownerAuth,
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('zero-auth (no token store)', () => {
    let app: ReturnType<typeof buildServer>;
    beforeEach(async () => {
      app = buildServer(services); // default local provider, no tokenStore
      await app.ready();
    });
    afterEach(async () => {
      await app.close();
    });

    it('409s token management when no store is configured', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/tokens' });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('CONFLICT');
    });

    it('serves the RBAC catalog', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/rbac' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.roles).toContain('owner');
      expect(body.permissions).toContain('admin:manage');
      expect(body.rolePermissions.viewer).toContain('search:read');
      expect(body.rolePermissions.viewer).not.toContain('admin:manage');
    });
  });
});
