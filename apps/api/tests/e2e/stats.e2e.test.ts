import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  buildServer,
  createInMemoryTokenStore,
  createTokenAuthProvider,
  type ApiServices,
  type TokenStore,
} from '../../src/index';
import type { StatsResponse } from '../../src/schemas/stats';
import { createInMemoryServices } from './support/in-memory-services';

/** The workspace summary over the HTTP surface (F-060; FR-38/FR-62). */
describe('@tessera/api stats', () => {
  let services: ApiServices;
  let repo: string;

  beforeAll(async () => {
    repo = await mkdtemp(join(tmpdir(), 'tessera-stats-e2e-'));
    await mkdir(join(repo, 'src'), { recursive: true });
    await writeFile(join(repo, 'README.md'), '# Repo\n\nHello.\n');
    await writeFile(join(repo, 'src', 'a.ts'), 'export const a = 1;\n');
  });

  afterAll(async () => {
    await rm(repo, { recursive: true, force: true });
  });

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

    it('reports the workspace as it really is before any scan or capture', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/stats' });
      expect(res.statusCode).toBe(200);
      // Nothing ingested, remembered, or connected yet — but the graph reports the fixture's real
      // seed (2 nodes + 1 effect-link, see support/in-memory-services), which is the point: these
      // numbers are read live from the stores, not defaulted to zero.
      expect(res.json()).toEqual({
        documents: 0,
        memories: 0,
        graph: { nodes: 2, effectLinks: 1 },
        sources: 0,
        lastScanAt: null,
      });
    });

    it('reports real counts after a scan and a captured memory', async () => {
      const registered = await app.inject({
        method: 'POST',
        url: '/v1/sources',
        payload: { kind: 'filesystem', config: { root: repo } },
      });
      const source = registered.json() as { id: string };
      await app.inject({ method: 'POST', url: `/v1/sources/${source.id}/scan` });

      await app.inject({
        method: 'POST',
        url: '/v1/memory',
        payload: { kind: 'decision', title: 'Use SQLite locally', body: 'Zero external deps.' },
      });

      const res = await app.inject({ method: 'GET', url: '/v1/stats' });
      expect(res.statusCode).toBe(200);
      const stats = res.json() as StatsResponse;

      // The two fixture files were really ingested; the memory was really captured.
      expect(stats.documents).toBe(2);
      expect(stats.memories).toBe(1);
      expect(stats.sources).toBe(1);
      // A scan completed in this process, so the timestamp is real.
      expect(stats.lastScanAt).not.toBeNull();
      expect(Number.isNaN(Date.parse(stats.lastScanAt!))).toBe(false);
      // Tenancy never appears on the wire (ADR-0033).
      expect(stats).not.toHaveProperty('tenantId');
      // No fabricated trends: the response carries no delta/trend field at all (D4 of the plan).
      expect(stats).not.toHaveProperty('deltas');
      expect(JSON.stringify(stats)).not.toContain('delta');
    });

    it('counts memories by lineage — an edit supersedes rather than adds', async () => {
      const captured = await app.inject({
        method: 'POST',
        url: '/v1/memory',
        payload: { kind: 'lesson', title: 'Original', body: 'First body.' },
      });
      const { lineageId } = captured.json() as { lineageId: string };

      const before = (
        await app.inject({ method: 'GET', url: '/v1/stats' })
      ).json() as StatsResponse;
      expect(before.memories).toBe(1);

      await app.inject({
        method: 'PATCH',
        url: `/v1/memory/${lineageId}`,
        payload: { body: 'Revised body.' },
      });

      const after = (await app.inject({ method: 'GET', url: '/v1/stats' })).json() as StatsResponse;
      // Two versions now exist, but only one is current — the count must not double.
      expect(after.memories).toBe(1);
    });

    it('documents the stats route in the OpenAPI spec', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/openapi.json' });
      const paths = Object.keys((res.json() as { paths: Record<string, unknown> }).paths);
      expect(paths).toContain('/v1/stats');
    });
  });

  describe('token provider build (RBAC + tenancy)', () => {
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

    async function token(
      tenantId: string,
      roles: readonly string[],
      scopes?: readonly string[],
    ): Promise<string> {
      const { token: t } = await tokenStore.issue({
        tenantId,
        principalId: `p-${tenantId}-${roles.join('-')}`,
        roles: roles as never,
        ...(scopes === undefined ? {} : { scopes: scopes as never }),
      });
      return t;
    }

    it('scopes every number to the calling tenant', async () => {
      const acme = await token('acme', ['owner']);
      const globex = await token('globex', ['owner']);

      // Acme registers + scans a source and captures a memory. Globex does nothing.
      const registered = await app.inject({
        method: 'POST',
        url: '/v1/sources',
        payload: { kind: 'filesystem', config: { root: repo } },
        headers: { authorization: `Bearer ${acme}` },
      });
      const source = registered.json() as { id: string };
      await app.inject({
        method: 'POST',
        url: `/v1/sources/${source.id}/scan`,
        headers: { authorization: `Bearer ${acme}` },
      });
      await app.inject({
        method: 'POST',
        url: '/v1/memory',
        payload: { kind: 'decision', title: 'Acme only', body: 'Private to acme.' },
        headers: { authorization: `Bearer ${acme}` },
      });

      const acmeStats = (
        await app.inject({
          method: 'GET',
          url: '/v1/stats',
          headers: { authorization: `Bearer ${acme}` },
        })
      ).json() as StatsResponse;
      expect(acmeStats.sources).toBe(1);
      expect(acmeStats.memories).toBe(1);

      // Globex must see none of it.
      const globexStats = (
        await app.inject({
          method: 'GET',
          url: '/v1/stats',
          headers: { authorization: `Bearer ${globex}` },
        })
      ).json() as StatsResponse;
      expect(globexStats).toEqual({
        documents: 0,
        memories: 0,
        graph: { nodes: 0, effectLinks: 0 },
        sources: 0,
        lastScanAt: null,
      });
    });

    it('401s an anonymous caller and grants a viewer (stats:read is a read permission)', async () => {
      const anonymous = await app.inject({ method: 'GET', url: '/v1/stats' });
      expect(anonymous.statusCode).toBe(401);

      const viewer = await token('acme', ['viewer']);
      const res = await app.inject({
        method: 'GET',
        url: '/v1/stats',
        headers: { authorization: `Bearer ${viewer}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('403s a token scoped without stats:read, even though it may read memory', async () => {
      // Why stats:read is its own permission: a token scoped to memory alone must not learn
      // document/graph/source counts through the aggregate (scopes are a least-privilege cap).
      const scoped = await token('acme', ['owner'], ['memory:read']);

      const denied = await app.inject({
        method: 'GET',
        url: '/v1/stats',
        headers: { authorization: `Bearer ${scoped}` },
      });
      expect(denied.statusCode).toBe(403);
      expect(denied.json().error.code).toBe('FORBIDDEN');

      // The same token can still read what it WAS scoped to.
      const allowed = await app.inject({
        method: 'GET',
        url: '/v1/memory',
        headers: { authorization: `Bearer ${scoped}` },
      });
      expect(allowed.statusCode).toBe(200);
    });
  });

  describe('unconfigured runtime (no sources service)', () => {
    it('still reports memory + graph rather than failing the whole summary', async () => {
      // A deployment that never wired runtime source management still has real memory/graph numbers.
      // Blanking the entire Overview with a 500 over an opted-out component would be worse than
      // reporting an honest zero for the sources half.
      const { search, compiler, graph, memory } = services;
      const app = buildServer({ search, compiler, graph, memory });
      await app.ready();
      try {
        const res = await app.inject({ method: 'GET', url: '/v1/stats' });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ documents: 0, sources: 0, lastScanAt: null });
      } finally {
        await app.close();
      }
    });
  });
});
