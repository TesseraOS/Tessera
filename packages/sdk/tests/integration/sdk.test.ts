import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer, type ApiServices } from '@tessera/api';
import { createTesseraClient, TesseraApiError, type TesseraClient } from '../../src/index';

/** A minimal in-memory memory store so capture → read/history round-trips over real HTTP. */
function memoryStub() {
  const byLineage = new Map<string, Record<string, unknown>>();
  let seq = 0;
  const record = (input: Record<string, unknown>, lineageId: string, version: number) => ({
    id: `mem-${(seq += 1)}`,
    lineageId,
    kind: input['kind'],
    title: input['title'],
    body: input['body'],
    scope: input['scope'] ?? 'global',
    confidence: input['confidence'] ?? 1,
    metadata: input['metadata'] ?? {},
    version,
    supersedes: null,
    supersededBy: null,
    createdAt: new Date().toISOString(),
  });
  return {
    capture: (input: Record<string, unknown>) => {
      const lineageId = `lin-${byLineage.size + 1}`;
      const memory = record(input, lineageId, 1);
      byLineage.set(lineageId, memory);
      return Promise.resolve(memory);
    },
    getCurrent: (lineageId: string) => Promise.resolve(byLineage.get(lineageId)),
    edit: (lineageId: string, patch: Record<string, unknown>) => {
      const current = byLineage.get(lineageId) ?? {};
      const next = { ...current, ...patch, version: Number(current['version'] ?? 1) + 1 };
      byLineage.set(lineageId, next);
      return Promise.resolve(next);
    },
    history: (lineageId: string) =>
      Promise.resolve(byLineage.has(lineageId) ? [byLineage.get(lineageId)] : []),
    list: () => Promise.resolve([...byLineage.values()]),
    // Retention + DSR surface (F-047): the stub keeps one version per lineage, so exportAll is the
    // same set and prune has nothing to compact.
    exportAll: () => Promise.resolve([...byLineage.values()]),
    prune: () => Promise.resolve({ expiredLineages: 0, prunedVersions: 0 }),
    deleteLineage: (lineageId: string) => {
      byLineage.delete(lineageId);
      return Promise.resolve();
    },
    // Tenant scoping (FR-52) is a no-op for the canned stub — return the same store.
    forTenant() {
      return this;
    },
  };
}

/** Stub ApiServices returning schema-valid canned data — the routes serialize it, so the SDK sees real HTTP. */
function stubServices(): ApiServices {
  return {
    search: {
      search: () =>
        Promise.resolve([
          {
            ref: 'doc:auth',
            score: 0.9,
            signals: [{ signal: 'keyword', rank: 1, score: 1, weight: 1, contribution: 0.9 }],
            label: 'authentication',
          },
        ]),
      forTenant() {
        return this;
      },
    },
    compiler: {
      compile: (request: { task: string; budget: number }) =>
        Promise.resolve({
          task: request.task,
          budget: request.budget,
          sections: [],
          totalTokens: 0,
          trace: { stages: [] },
          scores: { fragmentCount: 0, budgetAdherence: 1, provenanceCoverage: 1, redundancy: 0 },
        }),
      forTenant() {
        return this;
      },
    },
    graph: {
      getEffects: () => Promise.resolve({ effects: [] }),
      exportAll: () => Promise.resolve({ nodes: [], edges: [] }),
      purge: () => Promise.resolve({ nodes: 0, edges: 0 }),
      forTenant() {
        return this;
      },
    },
    memory: memoryStub(),
  } as unknown as ApiServices;
}

describe('@tessera/sdk round-trip against the real API (FR-39)', () => {
  let app: FastifyInstance;
  let client: TesseraClient;

  beforeAll(async () => {
    app = buildServer(stubServices());
    await app.listen({ host: '127.0.0.1', port: 0 });
    const { port } = app.server.address() as AddressInfo;
    client = createTesseraClient({ baseUrl: `http://127.0.0.1:${port}` });
  });

  afterAll(async () => {
    await app.close();
  });

  it('search returns typed, ranked results with signal attribution', async () => {
    const { results } = await client.search({ query: 'authentication tokens' });
    expect(results[0]?.ref).toBe('doc:auth');
    expect(results[0]?.signals[0]?.signal).toBe('keyword');
  });

  it('compile returns a budget-bounded Context Package', async () => {
    const pkg = await client.compile({ task: 'auth flow', budget: 500 });
    expect(pkg.task).toBe('auth flow');
    expect(pkg.budget).toBe(500);
    expect(pkg.scores.budgetAdherence).toBe(1);
  });

  it('captures then reads/edits/lists a memory (round-trip)', async () => {
    const created = await client.captureMemory({
      kind: 'decision',
      title: 'Adopt the generated SDK',
      body: 'The web app will consume @tessera/sdk.',
    });
    expect(created.lineageId).toBeTruthy();
    expect(created.version).toBe(1);

    const current = await client.getMemory(created.lineageId);
    expect(current.title).toBe('Adopt the generated SDK');

    const edited = await client.editMemory(created.lineageId, { body: 'Updated rationale.' });
    expect(edited.version).toBe(2);
    expect(edited.body).toBe('Updated rationale.');

    const history = await client.memoryHistory(created.lineageId);
    expect(history.versions.length).toBeGreaterThanOrEqual(1);

    const list = await client.listMemories({ kind: 'decision' });
    expect(list.memories.length).toBeGreaterThan(0);
  });

  it('maps a not-found response to a typed TesseraApiError', async () => {
    await expect(client.getMemory('does-not-exist')).rejects.toBeInstanceOf(TesseraApiError);
    await expect(client.getMemory('does-not-exist')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
  });

  it('rejects invalid input at the boundary (validation → 400)', async () => {
    await expect(
      client.captureMemory({ kind: 'decision', title: '', body: '' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('me() returns the zero-auth local identity', async () => {
    const identity = await client.me();
    expect(identity.principal).toMatchObject({ id: 'local', kind: 'local' });
    expect(identity.tenantId).toBe('default');
    expect(identity.permissions).toContain('admin:manage');
  });

  it('getRbac returns the roles/permissions catalog', async () => {
    const rbac = await client.getRbac();
    expect(rbac.roles).toContain('owner');
    expect(rbac.permissions).toContain('admin:manage');
    expect(rbac.rolePermissions.viewer).toContain('search:read');
  });

  it('listTokens 409s when no token store is wired (zero-auth)', async () => {
    await expect(client.listTokens()).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
  });

  it('getPlans/getHealth/getReady read the ops + billing surfaces', async () => {
    const plans = await client.getPlans();
    expect(Array.isArray(plans.plans)).toBe(true);

    const health = await client.getHealth();
    expect(health.status).toBe('ok');

    // No readiness probe wired on the stub ⇒ ready (200 body returned as data).
    const ready = await client.getReady();
    expect(ready.status).toBe('ready');
  });

  it('getRetention/pruneRetention read + apply the retention surface (F-047)', async () => {
    // No policy wired on this server ⇒ retention is off and the pass is a no-op.
    expect(await client.getRetention()).toEqual({ rules: [] });
    expect(await client.pruneRetention()).toEqual({ expiredLineages: 0, prunedVersions: 0 });
  });

  // Erasure runs last: it empties the shared stub's data plane.
  it('exportTenantData then deleteTenantData round-trip the DSR surface (NFR-13)', async () => {
    await client.captureMemory({ kind: 'lesson', title: 'To export', body: 'body' });

    const bundle = await client.exportTenantData();
    expect(bundle.tenantId).toBe('default');
    expect(bundle.memories.some((memory) => memory.title === 'To export')).toBe(true);
    expect(Array.isArray(bundle.audit)).toBe(true);
    expect(bundle.graph).toMatchObject({ nodes: [], edges: [] });

    const deleted = await client.deleteTenantData();
    expect(deleted.tenantId).toBe('default');
    expect(deleted.memories).toBeGreaterThan(0);
    expect((await client.exportTenantData()).memories).toEqual([]);
  });
});
