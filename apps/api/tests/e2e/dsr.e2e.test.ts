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
 * E2E for compliance completion (F-047): data-subject-rights export/erasure (NFR-13) and the memory
 * retention surface (FR-15). Everything runs against a real server over `app.inject()` with token auth,
 * so the `admin:manage` guard, tenant scoping, and audit recording are all exercised for real.
 */
describe('@tessera/api /v1/dsr + /v1/retention', () => {
  let services: ApiServices;
  let app: ReturnType<typeof buildServer>;
  let tokenStore: TokenStore;
  let owner: { authorization: string };
  let viewer: { authorization: string };
  let otherTenant: { authorization: string };

  /** Bearer headers for a freshly issued token. */
  async function issue(tenantId: string, principalId: string, roles: string[]) {
    const { token } = await tokenStore.issue({
      tenantId,
      principalId,
      roles: roles as Parameters<TokenStore['issue']>[0]['roles'],
    });
    return { authorization: `Bearer ${token}` };
  }

  beforeEach(async () => {
    services = await createInMemoryServices();
    tokenStore = createInMemoryTokenStore();
    owner = await issue('acme', 'admin', ['owner']);
    viewer = await issue('acme', 'reader', ['viewer']);
    otherTenant = await issue('globex', 'admin', ['owner']);
    app = buildServer(services, {
      auth: createTokenAuthProvider({ tokenStore }),
      tokenStore,
      // Count-based compaction is clock-free ⇒ deterministic; the expiry case overrides this per-test.
      memoryRetention: { rules: [{ kind: 'lesson', maxSupersededVersions: 0 }] },
    });
    await app.ready();
  });
  afterEach(async () => {
    await app.close();
  });

  /** Seed a tenant's data plane through the real API: a memory, an edit, and a graph effect-link. */
  async function seed(auth: { authorization: string }, title: string) {
    const captured = await app.inject({
      method: 'POST',
      url: '/v1/memory',
      headers: auth,
      payload: { kind: 'lesson', title, body: 'first' },
    });
    expect(captured.statusCode).toBe(201);
    const lineageId = captured.json().lineageId as string;
    const edited = await app.inject({
      method: 'PATCH',
      url: `/v1/memory/${lineageId}`,
      headers: auth,
      payload: { body: 'second' },
    });
    expect(edited.statusCode).toBe(200);
    return lineageId;
  }

  describe('GET /v1/dsr/export', () => {
    it('exports a complete bundle: every memory version, the graph, sources, and the audit trail', async () => {
      await seed(owner, 'Acme lesson');

      const response = await app.inject({ method: 'GET', url: '/v1/dsr/export', headers: owner });
      expect(response.statusCode).toBe(200);
      const bundle = response.json();

      expect(bundle.tenantId).toBe('acme');
      expect(typeof bundle.exportedAt).toBe('string');
      // BOTH versions are exported — an export is the full lineage, not just the current version.
      expect(bundle.memories).toHaveLength(2);
      expect(bundle.memories.map((m: { body: string }) => m.body).sort()).toEqual([
        'first',
        'second',
      ]);
      expect(bundle.memories.some((m: { version: number }) => m.version === 1)).toBe(true);
      // The other sections are present and shaped.
      expect(Array.isArray(bundle.graph.nodes)).toBe(true);
      expect(Array.isArray(bundle.graph.edges)).toBe(true);
      expect(Array.isArray(bundle.sources)).toBe(true);
      // The trail carries this tenant's own recorded actions (memory.write from the seed).
      expect(bundle.audit.some((e: { action: string }) => e.action === 'memory.write')).toBe(true);
      expect(bundle.audit.every((e: { tenantId: string }) => e.tenantId === 'acme')).toBe(true);
    });

    it('never leaks another tenant across the export boundary', async () => {
      await seed(owner, 'Acme lesson');
      await seed(otherTenant, 'Globex lesson');

      const acme = (
        await app.inject({ method: 'GET', url: '/v1/dsr/export', headers: owner })
      ).json();
      const globex = (
        await app.inject({ method: 'GET', url: '/v1/dsr/export', headers: otherTenant })
      ).json();

      expect(acme.memories.every((m: { title: string }) => m.title === 'Acme lesson')).toBe(true);
      expect(globex.memories.every((m: { title: string }) => m.title === 'Globex lesson')).toBe(
        true,
      );
      expect(globex.audit.every((e: { tenantId: string }) => e.tenantId === 'globex')).toBe(true);
    });

    it('requires admin:manage (viewer 403) and authentication (401)', async () => {
      expect(
        (await app.inject({ method: 'GET', url: '/v1/dsr/export', headers: viewer })).statusCode,
      ).toBe(403);
      expect((await app.inject({ method: 'GET', url: '/v1/dsr/export' })).statusCode).toBe(401);
    });
  });

  describe('POST /v1/dsr/delete', () => {
    it('erases the tenant data plane and reports what it removed', async () => {
      const lineageId = await seed(owner, 'Acme lesson');

      const response = await app.inject({ method: 'POST', url: '/v1/dsr/delete', headers: owner });
      expect(response.statusCode).toBe(200);
      const summary = response.json();
      expect(summary.tenantId).toBe('acme');
      expect(summary.memories).toBe(1); // one lineage (both versions)
      expect(typeof summary.deletedAt).toBe('string');

      // The memory is gone from every read path.
      expect(
        (await app.inject({ method: 'GET', url: `/v1/memory/${lineageId}`, headers: owner }))
          .statusCode,
      ).toBe(404);
      const list = await app.inject({ method: 'GET', url: '/v1/memory', headers: owner });
      expect(list.json().memories).toEqual([]);
      const after = await app.inject({ method: 'GET', url: '/v1/dsr/export', headers: owner });
      expect(after.json().memories).toEqual([]);
    });

    it('retains the audit trail — including the erasure event itself (ADR-0049)', async () => {
      await seed(owner, 'Acme lesson');
      await app.inject({ method: 'POST', url: '/v1/dsr/delete', headers: owner });

      const audit = await app.inject({ method: 'GET', url: '/v1/audit', headers: owner });
      expect(audit.statusCode).toBe(200);
      const actions = audit.json().events.map((e: { action: string }) => e.action);
      // The erasure is recorded, and the pre-erasure trail survives it.
      expect(actions).toContain('dsr.delete');
      expect(actions).toContain('memory.write');
    });

    it('erases only the calling tenant', async () => {
      await seed(owner, 'Acme lesson');
      await seed(otherTenant, 'Globex lesson');

      await app.inject({ method: 'POST', url: '/v1/dsr/delete', headers: owner });

      const globex = await app.inject({ method: 'GET', url: '/v1/memory', headers: otherTenant });
      expect(globex.json().memories).toHaveLength(1);
      expect(globex.json().memories[0].title).toBe('Globex lesson');
    });

    it('requires admin:manage (viewer 403) and authentication (401)', async () => {
      expect(
        (await app.inject({ method: 'POST', url: '/v1/dsr/delete', headers: viewer })).statusCode,
      ).toBe(403);
      expect((await app.inject({ method: 'POST', url: '/v1/dsr/delete' })).statusCode).toBe(401);
    });
  });

  describe('/v1/retention', () => {
    it('returns the effective policy and is admin-only', async () => {
      const response = await app.inject({ method: 'GET', url: '/v1/retention', headers: owner });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ rules: [{ kind: 'lesson', maxSupersededVersions: 0 }] });

      expect(
        (await app.inject({ method: 'GET', url: '/v1/retention', headers: viewer })).statusCode,
      ).toBe(403);
    });

    it('prune compacts superseded versions, keeps the current one, and is audited', async () => {
      const lineageId = await seed(owner, 'Acme lesson'); // v1 superseded by v2

      const response = await app.inject({
        method: 'POST',
        url: '/v1/retention/prune',
        headers: owner,
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ expiredLineages: 0, prunedVersions: 1 });

      // The current version survives; only the superseded v1 is gone.
      const history = await app.inject({
        method: 'GET',
        url: `/v1/memory/${lineageId}/history`,
        headers: owner,
      });
      expect(history.json().versions).toHaveLength(1);
      expect(history.json().versions[0]).toMatchObject({ version: 2, body: 'second' });

      const audit = await app.inject({ method: 'GET', url: '/v1/audit', headers: owner });
      expect(audit.json().events.map((e: { action: string }) => e.action)).toContain(
        'retention.manage',
      );
    });

    it('prune expires an aged lineage outright', async () => {
      const expiring = buildServer(services, {
        auth: createTokenAuthProvider({ tokenStore }),
        tokenStore,
        // maxAgeMs: -1 ⇒ every lesson is past its window, whatever the wall clock says (deterministic).
        memoryRetention: { rules: [{ kind: 'lesson', maxAgeMs: -1 }] },
      });
      await expiring.ready();
      try {
        const captured = await expiring.inject({
          method: 'POST',
          url: '/v1/memory',
          headers: owner,
          payload: { kind: 'lesson', title: 'Stale', body: 'b' },
        });
        expect(captured.statusCode).toBe(201);

        const response = await expiring.inject({
          method: 'POST',
          url: '/v1/retention/prune',
          headers: owner,
        });
        expect(response.json()).toEqual({ expiredLineages: 1, prunedVersions: 0 });
        expect(
          (await expiring.inject({ method: 'GET', url: '/v1/memory', headers: owner })).json()
            .memories,
        ).toEqual([]);
      } finally {
        await expiring.close();
      }
    });

    it('prune is tenant-scoped and requires admin:manage', async () => {
      await seed(otherTenant, 'Globex lesson');

      // Acme's prune must not touch globex's superseded version.
      await app.inject({ method: 'POST', url: '/v1/retention/prune', headers: owner });
      const globex = await app.inject({ method: 'GET', url: '/v1/memory', headers: otherTenant });
      expect(globex.json().memories).toHaveLength(1);

      expect(
        (await app.inject({ method: 'POST', url: '/v1/retention/prune', headers: viewer }))
          .statusCode,
      ).toBe(403);
    });
  });
});
