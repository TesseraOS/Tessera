import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer, type ApiServices } from '../../src/index';
import {
  createInMemoryServices,
  EFFECT_DEPENDENT_KEY,
  EFFECT_SOURCE,
} from './support/in-memory-services';

/** End-to-end over the HTTP surface via `app.inject()` — no socket, full Fastify lifecycle. */
describe('@tessera/api REST /v1', () => {
  let app: ReturnType<typeof buildServer>;
  let services: ApiServices;

  beforeEach(async () => {
    services = await createInMemoryServices();
    app = buildServer(services);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('operational', () => {
    it('GET /health is live', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: 'ok' });
    });

    it('GET /ready reports ready with no checks by default', async () => {
      const res = await app.inject({ method: 'GET', url: '/ready' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: 'ready', checks: [] });
    });

    it('GET /ready returns 503 when a dependency is not ready', async () => {
      const notReady = buildServer({
        ...services,
        readiness: () =>
          Promise.resolve({
            ready: false,
            checks: [{ name: 'store', ok: false, detail: 'connecting' }],
          }),
      });
      await notReady.ready();
      const res = await notReady.inject({ method: 'GET', url: '/ready' });
      expect(res.statusCode).toBe(503);
      expect(res.json().status).toBe('not_ready');
      await notReady.close();
    });
  });

  describe('OpenAPI', () => {
    it('GET /v1/openapi.json is a generated document listing the routes', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/openapi.json' });
      expect(res.statusCode).toBe(200);
      const doc = res.json();
      expect(doc.openapi).toMatch(/^3\./);
      expect(Object.keys(doc.paths)).toEqual(
        expect.arrayContaining([
          '/v1/search',
          '/v1/compile',
          '/v1/effects',
          '/v1/memory',
          '/health',
        ]),
      );
    });
  });

  describe('POST /v1/search', () => {
    it('returns one fused, ranked candidate set with signal attribution', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/search',
        payload: { query: 'authentication tokens' },
      });
      expect(res.statusCode).toBe(200);
      const { results } = res.json();
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toMatchObject({ ref: expect.any(String), score: expect.any(Number) });
      expect(results[0].signals[0]).toMatchObject({ signal: 'keyword' });
    });

    it('rejects a missing query with a 400 VALIDATION envelope', async () => {
      const res = await app.inject({ method: 'POST', url: '/v1/search', payload: {} });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION');
    });

    it('threads `include` through to the retriever, and omits it entirely by default', async () => {
      // What this route OWNS is validation + threading; the enrichment itself is a composition-root
      // decorator (@tessera/config) with its own tests, and the wiring is proven end-to-end in
      // tests/e2e-full against a real runtime. A spy is the honest unit of proof here.
      const seen: unknown[] = [];
      const spy = {
        search(query: { text: string; include?: unknown }) {
          seen.push(query.include);
          return Promise.resolve([]);
        },
        forTenant() {
          return spy;
        },
        forProject() {
          return spy;
        },
      };
      const spied = buildServer({ ...services, search: spy as unknown as ApiServices['search'] });
      await spied.ready();
      try {
        await spied.inject({ method: 'POST', url: '/v1/search', payload: { query: 'a' } });
        // A ranked answer is billed to every caller on every call — the default must stay lean.
        expect(seen[0]).toBeUndefined();

        await spied.inject({
          method: 'POST',
          url: '/v1/search',
          payload: { query: 'a', include: { kind: true, node: true, snippet: { maxChars: 80 } } },
        });
        expect(seen[1]).toEqual({ kind: true, node: true, snippet: { maxChars: 80 } });

        // An asked-for snippet with no options still reaches the retriever as a request, not as
        // `undefined` — otherwise "give me a default-sized excerpt" would silently mean "no excerpt".
        await spied.inject({
          method: 'POST',
          url: '/v1/search',
          payload: { query: 'a', include: { snippet: {} } },
        });
        expect(seen[2]).toEqual({ snippet: {} });
      } finally {
        await spied.close();
      }
    });

    it('rejects a malformed `include` rather than silently ignoring it', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/search',
        payload: { query: 'a', include: { snippet: { maxChars: -5 } } },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION');
    });

    it('documents the include contract in the OpenAPI spec', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/openapi.json' });
      const spec = res.json() as { paths: Record<string, unknown> };
      const body = JSON.stringify(spec.paths['/v1/search']);
      // The token cost of each extra is on the wire contract, so a caller can choose knowingly.
      expect(body).toContain('include');
      expect(body).toContain('snippet');
      expect(body).toContain('node');
    });
  });

  describe('POST /v1/compile', () => {
    it('returns a budget-bounded, provenance-tagged package with a full trace', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/compile',
        payload: { task: 'how does authentication work', budget: 80 },
      });
      expect(res.statusCode).toBe(200);
      const pkg = res.json();
      expect(pkg.totalTokens).toBeLessThanOrEqual(80);
      const fragments = pkg.sections.flatMap(
        (section: { fragments: unknown[] }) => section.fragments,
      );
      expect(fragments.length).toBeGreaterThan(0);
      expect(fragments[0]).toHaveProperty('whyIncluded');
      expect(fragments[0]).toHaveProperty('provenance');
      expect(pkg.trace.stages.map((stage: { stage: string }) => stage.stage)).toEqual(
        expect.arrayContaining(['plan', 'retrieve', 'compress', 'assemble']),
      );
    });

    it('rejects a non-positive budget', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/compile',
        payload: { task: 'x', budget: 0 },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION');
    });
  });

  describe('GET /v1/effects', () => {
    it('returns ranked dependents of a node with their paths', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/effects?kind=${EFFECT_SOURCE.kind}&key=${encodeURIComponent(EFFECT_SOURCE.key)}`,
      });
      expect(res.statusCode).toBe(200);
      const { effects } = res.json();
      expect(effects.map((hit: { node: { key: string } }) => hit.node.key)).toContain(
        EFFECT_DEPENDENT_KEY,
      );
      expect(effects[0].path.length).toBeGreaterThanOrEqual(2);
    });

    it('returns 404 for an unknown node', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/effects?kind=file&key=does/not/exist.ts',
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    });
  });

  describe('/v1/memory', () => {
    const capture = { kind: 'decision', title: 'Use Fastify', body: 'ADR-0002 picks Fastify.' };

    it('captures, reads, edits (new version), and lists', async () => {
      const created = await app.inject({ method: 'POST', url: '/v1/memory', payload: capture });
      expect(created.statusCode).toBe(201);
      const memory = created.json();
      expect(memory).toMatchObject({ version: 1, supersedes: null, supersededBy: null });

      const got = await app.inject({ method: 'GET', url: `/v1/memory/${memory.lineageId}` });
      expect(got.statusCode).toBe(200);
      expect(got.json().id).toBe(memory.id);

      const edited = await app.inject({
        method: 'PATCH',
        url: `/v1/memory/${memory.lineageId}`,
        payload: { body: 'ADR-0002 picks Fastify v5.' },
      });
      expect(edited.statusCode).toBe(200);
      expect(edited.json()).toMatchObject({ version: 2, supersedes: memory.id });

      const history = await app.inject({
        method: 'GET',
        url: `/v1/memory/${memory.lineageId}/history`,
      });
      expect(history.json().versions).toHaveLength(2);

      const list = await app.inject({ method: 'GET', url: '/v1/memory?kind=decision' });
      expect(list.json().memories.map((m: { id: string }) => m.id)).toContain(edited.json().id);
    });

    it('returns 404 for an unknown lineage', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/memory/nonexistent' });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    });

    it('rejects an invalid kind with a 400 VALIDATION envelope', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/memory',
        payload: { kind: 'bogus', title: 't', body: 'b' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION');
    });
  });

  it('uses the consistent error envelope for unmatched routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
});
