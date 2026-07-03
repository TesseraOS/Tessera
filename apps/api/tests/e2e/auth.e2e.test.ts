import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildServer,
  createInMemoryTokenStore,
  createTokenAuthProvider,
  type ApiServices,
  type TokenStore,
} from '../../src/index';
import { createInMemoryServices } from './support/in-memory-services';

const SEARCH_BODY = { query: 'authentication tokens' };
const MEMORY_BODY = { kind: 'decision', title: 'Adopt X', body: 'We will adopt X because Y.' };

/** End-to-end auth/RBAC enforcement over the HTTP surface via `app.inject()` (F-025). */
describe('@tessera/api auth + RBAC', () => {
  let services: ApiServices;

  beforeEach(async () => {
    services = await createInMemoryServices();
  });

  describe('default build (zero-auth Local provider)', () => {
    let app: ReturnType<typeof buildServer>;

    beforeEach(async () => {
      app = buildServer(services);
      await app.ready();
    });
    afterEach(async () => {
      await app.close();
    });

    it('serves /v1/search without any credentials (back-compat)', async () => {
      const res = await app.inject({ method: 'POST', url: '/v1/search', payload: SEARCH_BODY });
      expect(res.statusCode).toBe(200);
    });

    it('serves the write path (/v1/memory) without credentials', async () => {
      const res = await app.inject({ method: 'POST', url: '/v1/memory', payload: MEMORY_BODY });
      expect(res.statusCode).toBe(201);
    });
  });

  describe('token provider build (RBAC enforced)', () => {
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

    it('rejects an unauthenticated request with 401 UNAUTHORIZED', async () => {
      const res = await app.inject({ method: 'POST', url: '/v1/search', payload: SEARCH_BODY });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });

    it('allows a viewer to search but forbids writing memory (403)', async () => {
      const { token } = await tokenStore.issue({
        tenantId: 'acme',
        principalId: 'reader',
        roles: ['viewer'],
      });
      const headers = { authorization: `Bearer ${token}` };

      const read = await app.inject({
        method: 'POST',
        url: '/v1/search',
        payload: SEARCH_BODY,
        headers,
      });
      expect(read.statusCode).toBe(200);

      const write = await app.inject({
        method: 'POST',
        url: '/v1/memory',
        payload: MEMORY_BODY,
        headers,
      });
      expect(write.statusCode).toBe(403);
      expect(write.json().error.code).toBe('FORBIDDEN');
    });

    it('allows a member to write memory (201)', async () => {
      const { token } = await tokenStore.issue({
        tenantId: 'acme',
        principalId: 'writer',
        roles: ['member'],
      });
      const res = await app.inject({
        method: 'POST',
        url: '/v1/memory',
        payload: MEMORY_BODY,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(201);
    });

    it('rejects a revoked token with 401', async () => {
      const { token, record } = await tokenStore.issue({
        tenantId: 'acme',
        principalId: 'writer',
        roles: ['member'],
      });
      await tokenStore.revoke(record.id);
      const res = await app.inject({
        method: 'POST',
        url: '/v1/search',
        payload: SEARCH_BODY,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(401);
    });

    it('keeps the OpenAPI document public under auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/openapi.json' });
      expect(res.statusCode).toBe(200);
      expect(res.json().openapi).toMatch(/^3\./);
    });
  });
});
