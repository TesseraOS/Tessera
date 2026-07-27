import { createStaticFlagProvider } from '@tessera/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildServer,
  createInMemoryTokenStore,
  createTokenAuthProvider,
  type ApiServices,
  type TokenStore,
} from '../../src/index';
import { createInMemoryServices } from './support/in-memory-services';

/**
 * **F-058 increment 7** — `GET /v1/flags` (FR-57, ADR-0061 §1).
 *
 * The property under test is the one a unit test of the provider cannot reach: that the tenant the
 * flag is evaluated for is the tenant **the request authenticated as**, and not a default threaded
 * through by accident.
 */
const DEFINITIONS = [
  { key: 'beta.search', description: 'New ranker', defaultEnabled: false, tenants: { acme: true } },
  { key: 'graph.v2', description: 'Graph rewrite', defaultEnabled: true },
];

describe('@tessera/api GET /v1/flags (F-058)', () => {
  let services: ApiServices;

  beforeEach(async () => {
    services = await createInMemoryServices();
  });

  describe('with a provider wired', () => {
    let app: ReturnType<typeof buildServer>;

    beforeEach(async () => {
      app = buildServer(services, { flags: createStaticFlagProvider(DEFINITIONS) });
      await app.ready();
    });
    afterEach(async () => {
      await app.close();
    });

    it('evaluates every declared flag for the calling tenant, with the reason', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/flags' });

      expect(res.statusCode).toBe(200);
      // Zero-auth Local mode authenticates as the `default` tenant, which has no override.
      expect(res.json()).toEqual({
        flags: [
          {
            key: 'beta.search',
            description: 'New ranker',
            enabled: false,
            source: 'default',
          },
          { key: 'graph.v2', description: 'Graph rewrite', enabled: true, source: 'default' },
        ],
      });
    });
  });

  describe('with no provider wired', () => {
    let app: ReturnType<typeof buildServer>;

    beforeEach(async () => {
      app = buildServer(services);
      await app.ready();
    });
    afterEach(async () => {
      await app.close();
    });

    it('answers an empty catalog rather than an error — no flags declared is the default state', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/flags' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ flags: [] });
    });

    it('is described in the OpenAPI document, so the SDK and docs can see it', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/openapi.json' });

      expect(res.json().paths['/v1/flags']?.get).toBeDefined();
    });
  });

  describe('per-tenant evaluation under real credentials', () => {
    let app: ReturnType<typeof buildServer>;
    let tokenStore: TokenStore;

    beforeEach(async () => {
      tokenStore = createInMemoryTokenStore();
      app = buildServer(services, {
        auth: createTokenAuthProvider({ tokenStore }),
        flags: createStaticFlagProvider(DEFINITIONS),
      });
      await app.ready();
    });
    afterEach(async () => {
      await app.close();
    });

    const flagsFor = async (tenantId: string, roles: readonly string[] = ['viewer']) => {
      const { token } = await tokenStore.issue({
        tenantId,
        principalId: `p-${tenantId}`,
        roles: [...roles] as never,
      });
      return app.inject({
        method: 'GET',
        url: '/v1/flags',
        headers: { authorization: `Bearer ${token}` },
      });
    };

    it('gives the overridden tenant its override, and everyone else the default', async () => {
      // This is the whole feature: one org is in the rollout and another is not.
      const acme = await flagsFor('acme');
      const globex = await flagsFor('globex');

      expect(acme.json().flags[0]).toEqual({
        key: 'beta.search',
        description: 'New ranker',
        enabled: true,
        source: 'tenant-override',
      });
      expect(globex.json().flags[0]).toMatchObject({ enabled: false, source: 'default' });
    });

    it('requires authentication', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/flags' });

      expect(res.statusCode).toBe(401);
    });

    it('is readable by a viewer — a principal may see the flags that apply to it', async () => {
      expect((await flagsFor('acme', ['viewer'])).statusCode).toBe(200);
    });
  });
});
