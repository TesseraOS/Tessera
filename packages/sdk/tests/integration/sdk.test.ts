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
});
