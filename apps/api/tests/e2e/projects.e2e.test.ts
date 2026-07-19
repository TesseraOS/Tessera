import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildServer,
  createInMemoryTokenStore,
  createTokenAuthProvider,
  type ApiServices,
  type TokenStore,
} from '../../src/index';
import { createInMemoryServices } from './support/in-memory-services';

/** E2E for multi-project workspace management (F-050; FR-66, ADR-0037). */
describe('@tessera/api /v1/projects', () => {
  let services: ApiServices;
  beforeEach(async () => {
    services = await createInMemoryServices();
  });

  describe('zero-auth local profile (owner)', () => {
    let app: ReturnType<typeof buildServer>;
    beforeEach(async () => {
      app = buildServer(services);
      await app.ready();
    });
    afterEach(async () => {
      await app.close();
    });

    it('lists the reserved default project first, and it is marked isDefault', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/projects' });
      expect(res.statusCode).toBe(200);
      const { projects } = res.json();
      expect(projects).toHaveLength(1);
      expect(projects[0]).toMatchObject({ id: 'default', isDefault: true });
      // The tenantId never rides the wire.
      expect(Object.keys(projects[0])).not.toContain('tenantId');
    });

    it('creates, gets, renames, and deletes a project through its full lifecycle', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/v1/projects',
        payload: { name: 'Frontend' },
      });
      expect(created.statusCode).toBe(201);
      const project = created.json();
      expect(project).toMatchObject({ name: 'Frontend', isDefault: false });
      const id = project.id as string;
      expect(id).not.toBe('default');

      // List now shows the default first, then the created project.
      const list = await app.inject({ method: 'GET', url: '/v1/projects' });
      expect(list.json().projects.map((p: { id: string }) => p.id)).toEqual(['default', id]);

      // Get by id.
      const got = await app.inject({ method: 'GET', url: `/v1/projects/${id}` });
      expect(got.statusCode).toBe(200);
      expect(got.json().name).toBe('Frontend');

      // Rename.
      const renamed = await app.inject({
        method: 'PATCH',
        url: `/v1/projects/${id}`,
        payload: { name: 'Web' },
      });
      expect(renamed.statusCode).toBe(200);
      expect(renamed.json().name).toBe('Web');

      // Delete.
      const deleted = await app.inject({ method: 'DELETE', url: `/v1/projects/${id}` });
      expect(deleted.statusCode).toBe(200);
      expect(deleted.json()).toMatchObject({ id, deleted: true });
      const after = await app.inject({ method: 'GET', url: `/v1/projects/${id}` });
      expect(after.statusCode).toBe(404);
    });

    it('rejects a duplicate name (409) and an over-long name (400)', async () => {
      await app.inject({ method: 'POST', url: '/v1/projects', payload: { name: 'Alpha' } });
      const dup = await app.inject({
        method: 'POST',
        url: '/v1/projects',
        payload: { name: 'alpha' },
      });
      expect(dup.statusCode).toBe(409);
      expect(dup.json().error.code).toBe('CONFLICT');

      const tooLong = await app.inject({
        method: 'POST',
        url: '/v1/projects',
        payload: { name: 'x'.repeat(200) },
      });
      expect(tooLong.statusCode).toBe(400);
    });

    it('refuses to rename or delete the reserved default project (400)', async () => {
      const renamed = await app.inject({
        method: 'PATCH',
        url: '/v1/projects/default',
        payload: { name: 'Nope' },
      });
      expect(renamed.statusCode).toBe(400);
      const deleted = await app.inject({ method: 'DELETE', url: '/v1/projects/default' });
      expect(deleted.statusCode).toBe(400);
    });

    it('404s an unknown project id', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/projects/nope' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('RBAC (token mode)', () => {
    let app: ReturnType<typeof buildServer>;
    let tokenStore: TokenStore;

    async function tokenFor(roles: ('owner' | 'member' | 'viewer')[]): Promise<string> {
      const { token } = await tokenStore.issue({ tenantId: 'acme', principalId: 'p', roles });
      return token;
    }

    beforeEach(async () => {
      tokenStore = createInMemoryTokenStore();
      app = buildServer(services, {
        auth: createTokenAuthProvider({ tokenStore }),
        tokenStore,
      });
      await app.ready();
    });
    afterEach(async () => {
      await app.close();
    });

    it('lets a viewer read projects but forbids creating one (projects:manage)', async () => {
      const viewer = await tokenFor(['viewer']);
      const list = await app.inject({
        method: 'GET',
        url: '/v1/projects',
        headers: { authorization: `Bearer ${viewer}` },
      });
      expect(list.statusCode).toBe(200);

      const denied = await app.inject({
        method: 'POST',
        url: '/v1/projects',
        headers: { authorization: `Bearer ${viewer}` },
        payload: { name: 'Nope' },
      });
      expect(denied.statusCode).toBe(403);
    });

    it('lets a member create a project (projects:manage)', async () => {
      const member = await tokenFor(['member']);
      const created = await app.inject({
        method: 'POST',
        url: '/v1/projects',
        headers: { authorization: `Bearer ${member}` },
        payload: { name: 'Service' },
      });
      expect(created.statusCode).toBe(201);
    });

    it('isolates projects by tenant — one tenant never sees another tenant projects', async () => {
      const acme = await tokenFor(['owner']);
      await app.inject({
        method: 'POST',
        url: '/v1/projects',
        headers: { authorization: `Bearer ${acme}` },
        payload: { name: 'AcmeOnly' },
      });
      const { token: globex } = await tokenStore.issue({
        tenantId: 'globex',
        principalId: 'g',
        roles: ['owner'],
      });
      const list = await app.inject({
        method: 'GET',
        url: '/v1/projects',
        headers: { authorization: `Bearer ${globex}` },
      });
      // Only globex's default project — none of acme's.
      expect(list.json().projects.map((p: { name: string }) => p.name)).toEqual(['Default']);
    });
  });

  describe('project selection (X-Tessera-Project) + data isolation', () => {
    let app: ReturnType<typeof buildServer>;
    beforeEach(async () => {
      app = buildServer(services);
      await app.ready();
    });
    afterEach(async () => {
      await app.close();
    });

    it("scopes memory to the header's project — invisible in other projects and the default", async () => {
      // Create a project, then capture a memory scoped to it via the header.
      const created = await app.inject({
        method: 'POST',
        url: '/v1/projects',
        payload: { name: 'Backend' },
      });
      const projectId = created.json().id as string;
      const header = { 'x-tessera-project': projectId };

      const captured = await app.inject({
        method: 'POST',
        url: '/v1/memory',
        headers: header,
        payload: { kind: 'decision', title: 'Use Fastify', body: 'ADR-0002 picks Fastify.' },
      });
      expect(captured.statusCode).toBe(201);
      const lineageId = captured.json().lineageId as string;

      // Visible inside the project.
      const inProject = await app.inject({ method: 'GET', url: '/v1/memory', headers: header });
      expect(inProject.json().memories.map((m: { lineageId: string }) => m.lineageId)).toContain(
        lineageId,
      );
      const byId = await app.inject({
        method: 'GET',
        url: `/v1/memory/${lineageId}`,
        headers: header,
      });
      expect(byId.statusCode).toBe(200);

      // Invisible in the default project (no header).
      const inDefault = await app.inject({ method: 'GET', url: '/v1/memory' });
      expect(inDefault.json().memories).toHaveLength(0);
      const byIdDefault = await app.inject({ method: 'GET', url: `/v1/memory/${lineageId}` });
      expect(byIdDefault.statusCode).toBe(404);

      // Invisible in a different project.
      const other = await app.inject({
        method: 'POST',
        url: '/v1/projects',
        payload: { name: 'Frontend' },
      });
      const otherId = other.json().id as string;
      const inOther = await app.inject({
        method: 'GET',
        url: '/v1/memory',
        headers: { 'x-tessera-project': otherId },
      });
      expect(inOther.json().memories).toHaveLength(0);
    });

    it('404s a request that selects an unknown/foreign project', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/memory',
        headers: { 'x-tessera-project': 'does-not-exist' },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    });

    it('treats an explicit `default` header as the default project (unchanged behavior)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/memory',
        headers: { 'x-tessera-project': 'default' },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('not configured', () => {
    it('409s when no project service is wired (e.g. doc generation)', async () => {
      const app = buildServer({ ...services, projects: undefined });
      await app.ready();
      try {
        const res = await app.inject({ method: 'GET', url: '/v1/projects' });
        expect(res.statusCode).toBe(409);
        expect(res.json().error.code).toBe('CONFLICT');
      } finally {
        await app.close();
      }
    });
  });
});
