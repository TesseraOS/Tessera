import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildServer,
  createInMemoryTokenStore,
  createTokenAuthProvider,
  type ApiServices,
  type TokenStore,
} from '../../src/index';
import {
  createInMemoryServices,
  EFFECT_DEPENDENT_KEY,
  EFFECT_SOURCE,
} from './support/in-memory-services';

/** End-to-end manual effect-link assertion over the HTTP surface (F-040; FR-17/18). */
describe('@tessera/api effects assertion', () => {
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

    it('asserts a manual effect-link that then appears in get_effects', async () => {
      // Assert: changing the dependent (app.ts) may require reviewing the source (core.ts).
      const asserted = await app.inject({
        method: 'POST',
        url: '/v1/effects',
        payload: {
          from: { kind: 'file', key: EFFECT_DEPENDENT_KEY },
          to: { kind: 'file', key: EFFECT_SOURCE.key },
          rationale: 'app and core share a contract',
        },
      });
      expect(asserted.statusCode).toBe(201);
      expect(asserted.json().origin).toBe('manual');

      const effects = await app.inject({
        method: 'GET',
        url: `/v1/effects?kind=file&key=${encodeURIComponent(EFFECT_DEPENDENT_KEY)}`,
      });
      expect(effects.statusCode).toBe(200);
      const keys = (effects.json().effects as { node: { key: string } }[]).map((e) => e.node.key);
      expect(keys).toContain(EFFECT_SOURCE.key);
    });

    it('rejects an invalid body (missing rationale)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/effects',
        payload: { from: { kind: 'file', key: 'a' }, to: { kind: 'file', key: 'b' } },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION');
    });
  });

  describe('token provider build (RBAC)', () => {
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

    async function token(roles: readonly string[]): Promise<string> {
      const { token: t } = await tokenStore.issue({
        tenantId: 'acme',
        principalId: `p-${roles.join('-')}`,
        roles: roles as never,
      });
      return t;
    }

    it('requires effects:write — a viewer is denied, a member allowed', async () => {
      const body = {
        from: { kind: 'file', key: 'x' },
        to: { kind: 'file', key: 'y' },
        rationale: 'x drives y',
      };
      const denied = await app.inject({
        method: 'POST',
        url: '/v1/effects',
        payload: body,
        headers: { authorization: `Bearer ${await token(['viewer'])}` },
      });
      expect(denied.statusCode).toBe(403);

      const allowed = await app.inject({
        method: 'POST',
        url: '/v1/effects',
        payload: body,
        headers: { authorization: `Bearer ${await token(['member'])}` },
      });
      expect(allowed.statusCode).toBe(201);
    });
  });
});
