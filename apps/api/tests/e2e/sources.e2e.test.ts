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
import { createInMemoryServices } from './support/in-memory-services';

/** End-to-end runtime source management over the HTTP surface (F-038; FR-62). */
describe('@tessera/api sources', () => {
  let services: ApiServices;
  let repo: string;

  beforeAll(async () => {
    repo = await mkdtemp(join(tmpdir(), 'tessera-src-e2e-'));
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

    it('registers, lists, gets, scans a filesystem source, and reports scan status', async () => {
      const registered = await app.inject({
        method: 'POST',
        url: '/v1/sources',
        payload: { kind: 'filesystem', config: { root: repo } },
      });
      expect(registered.statusCode).toBe(201);
      const source = registered.json() as { id: string; kind: string; config: { root: string } };
      expect(source.kind).toBe('filesystem');
      expect(source.config.root).toBe(repo);
      // Tenancy stays off the wire (ADR-0033).
      expect(source).not.toHaveProperty('tenantId');

      const list = await app.inject({ method: 'GET', url: '/v1/sources' });
      expect(list.statusCode).toBe(200);
      expect((list.json().sources as { id: string }[]).map((s) => s.id)).toEqual([source.id]);

      const got = await app.inject({ method: 'GET', url: `/v1/sources/${source.id}` });
      expect(got.statusCode).toBe(200);
      expect(got.json().id).toBe(source.id);

      const scan = await app.inject({ method: 'POST', url: `/v1/sources/${source.id}/scan` });
      expect(scan.statusCode).toBe(200);
      expect(scan.json().summary).toEqual({ added: 2, modified: 0, removed: 0, unchanged: 0 });

      const status = await app.inject({ method: 'GET', url: `/v1/sources/${source.id}/scan` });
      expect(status.statusCode).toBe(200);
      expect(status.json().state).toBe('idle');
      expect(status.json().lastScan.summary.added).toBe(2);
    });

    it('404s an unknown source and 400s an unsupported kind', async () => {
      const missing = await app.inject({ method: 'GET', url: '/v1/sources/nope' });
      expect(missing.statusCode).toBe(404);
      expect(missing.json().error.code).toBe('NOT_FOUND');

      const bad = await app.inject({
        method: 'POST',
        url: '/v1/sources',
        payload: { kind: 'svn', config: { root: '/x' } },
      });
      expect(bad.statusCode).toBe(400);
      expect(bad.json().error.code).toBe('VALIDATION');
    });

    it('removes a source', async () => {
      const registered = await app.inject({
        method: 'POST',
        url: '/v1/sources',
        payload: { kind: 'filesystem', config: { root: repo } },
      });
      const { id } = registered.json() as { id: string };
      const removed = await app.inject({ method: 'DELETE', url: `/v1/sources/${id}` });
      expect(removed.statusCode).toBe(200);
      expect(removed.json().id).toBe(id);
      const after = await app.inject({ method: 'GET', url: `/v1/sources/${id}` });
      expect(after.statusCode).toBe(404);
    });

    it('documents the sources routes in the OpenAPI spec', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/openapi.json' });
      const paths = Object.keys((res.json() as { paths: Record<string, unknown> }).paths);
      expect(paths).toContain('/v1/sources');
      expect(paths).toContain('/v1/sources/{id}');
      expect(paths).toContain('/v1/sources/{id}/scan');
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

    it('lets a member manage sources but denies a viewer (sources:manage)', async () => {
      const viewer = await token(['viewer']);
      const member = await token(['member']);

      const denied = await app.inject({
        method: 'POST',
        url: '/v1/sources',
        payload: { kind: 'filesystem', config: { root: repo } },
        headers: { authorization: `Bearer ${viewer}` },
      });
      expect(denied.statusCode).toBe(403);
      expect(denied.json().error.code).toBe('FORBIDDEN');

      const allowed = await app.inject({
        method: 'POST',
        url: '/v1/sources',
        payload: { kind: 'filesystem', config: { root: repo } },
        headers: { authorization: `Bearer ${member}` },
      });
      expect(allowed.statusCode).toBe(201);

      // A viewer may still read the list (sources:read).
      const list = await app.inject({
        method: 'GET',
        url: '/v1/sources',
        headers: { authorization: `Bearer ${viewer}` },
      });
      expect(list.statusCode).toBe(200);
    });
  });

  describe('unconfigured runtime (no sources service)', () => {
    it('returns a clean error when source management is not wired', async () => {
      // Compose services without a source service (e.g. doc generation / a profile that omits it).
      const { search, compiler, graph, memory } = services;
      const app = buildServer({ search, compiler, graph, memory });
      await app.ready();
      const res = await app.inject({
        method: 'GET',
        url: '/v1/sources',
      });
      expect(res.statusCode).toBe(500);
      expect(res.json().error.code).toBe('INTERNAL');
      await app.close();
    });
  });
});
