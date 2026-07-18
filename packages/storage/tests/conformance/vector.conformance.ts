import { describe, expect, it } from 'vitest';
import type { VectorMetric, VectorStore } from '../../src/ports/vector';

export interface VectorHarness {
  store: VectorStore;
  cleanup: () => Promise<void>;
}

export interface VectorConfig {
  dimension: number;
  metric?: VectorMetric;
}

/** Builds a fresh VectorStore (isolated index) per test. */
export type VectorFactory = (config: VectorConfig) => Promise<VectorHarness>;

/** The behavioral contract every {@link VectorStore} adapter must satisfy (ADR-0003/0006). */
export function runVectorConformance(name: string, makeStore: VectorFactory): void {
  describe(`VectorStore conformance: ${name}`, () => {
    it('upsert then query returns nearest first, with distance and model', async () => {
      const { store, cleanup } = await makeStore({ dimension: 3 });
      try {
        await store.upsert([
          { id: 'a', vector: [1, 0, 0], model: 'm1' },
          { id: 'b', vector: [0, 1, 0], model: 'm1' },
          { id: 'c', vector: [0.9, 0.1, 0], model: 'm1' },
        ]);
        const matches = await store.query([1, 0, 0], 2);
        expect(matches).toHaveLength(2);
        expect(matches[0]?.id).toBe('a');
        expect(matches[0]?.distance).toBeCloseTo(0);
        expect(matches[0]?.model).toBe('m1');
        expect(matches[1]?.id).toBe('c');
      } finally {
        await cleanup();
      }
    });

    it('respects k', async () => {
      const { store, cleanup } = await makeStore({ dimension: 3 });
      try {
        await store.upsert([
          { id: 'a', vector: [1, 0, 0], model: 'm1' },
          { id: 'b', vector: [0, 1, 0], model: 'm1' },
        ]);
        expect(await store.query([1, 0, 0], 1)).toHaveLength(1);
      } finally {
        await cleanup();
      }
    });

    it('upsert replaces an existing id', async () => {
      const { store, cleanup } = await makeStore({ dimension: 3 });
      try {
        await store.upsert([{ id: 'a', vector: [1, 0, 0], model: 'm1' }]);
        await store.upsert([{ id: 'a', vector: [0, 1, 0], model: 'm2' }]);
        const matches = await store.query([0, 1, 0], 1);
        expect(matches).toHaveLength(1);
        expect(matches[0]?.id).toBe('a');
        expect(matches[0]?.distance).toBeCloseTo(0);
        expect(matches[0]?.model).toBe('m2');
      } finally {
        await cleanup();
      }
    });

    it('delete removes vectors', async () => {
      const { store, cleanup } = await makeStore({ dimension: 3 });
      try {
        await store.upsert([{ id: 'a', vector: [1, 0, 0], model: 'm1' }]);
        await store.delete(['a']);
        expect(await store.query([1, 0, 0], 5)).toHaveLength(0);
      } finally {
        await cleanup();
      }
    });

    it('rejects vectors whose length != dimension', async () => {
      const { store, cleanup } = await makeStore({ dimension: 3 });
      try {
        await expect(store.upsert([{ id: 'x', vector: [1, 2], model: 'm1' }])).rejects.toThrow();
      } finally {
        await cleanup();
      }
    });

    it('exposes capabilities', async () => {
      const { store, cleanup } = await makeStore({ dimension: 3 });
      try {
        expect(store.capabilities.dimension).toBe(3);
        expect(['l2', 'cosine']).toContain(store.capabilities.metric);
      } finally {
        await cleanup();
      }
    });

    it('isolates vectors by tenant (forTenant) — no cross-tenant reads, same id per tenant', async () => {
      const { store, cleanup } = await makeStore({ dimension: 3 });
      try {
        const a = store.forTenant('tenant-a');
        const b = store.forTenant('tenant-b');
        // The same id `shared` exists independently in each tenant, plus a tenant-only id apiece.
        await a.upsert([
          { id: 'shared', vector: [1, 0, 0], model: 'mA' },
          { id: 'only-a', vector: [0, 1, 0], model: 'mA' },
        ]);
        await b.upsert([
          { id: 'shared', vector: [0, 0, 1], model: 'mB' },
          { id: 'only-b', vector: [0, 1, 0], model: 'mB' },
        ]);

        // A sees only its own rows; `shared` resolves to A's vector/model, never B's.
        const aMatches = await a.query([1, 0, 0], 5);
        expect(aMatches.map((m) => m.id).sort()).toEqual(['only-a', 'shared']);
        expect(aMatches.find((m) => m.id === 'shared')?.model).toBe('mA');

        // B sees only its own rows; the same id `shared` resolves to B's vector/model.
        const bMatches = await b.query([0, 0, 1], 5);
        expect(bMatches.map((m) => m.id).sort()).toEqual(['only-b', 'shared']);
        expect(bMatches.find((m) => m.id === 'shared')?.model).toBe('mB');

        // Deleting in A does not touch B.
        await a.delete(['shared', 'only-a']);
        expect(await a.query([1, 0, 0], 5)).toHaveLength(0);
        expect((await b.query([0, 0, 1], 5)).map((m) => m.id).sort()).toEqual(['only-b', 'shared']);
      } finally {
        await cleanup();
      }
    });

    it('isolates vectors by project (forProject) within a tenant — no cross-project reads, same id per project', async () => {
      const { store, cleanup } = await makeStore({ dimension: 3 });
      try {
        // Two projects within the same tenant, plus that tenant's default project.
        const tenant = store.forTenant('tenant-a');
        const p1 = tenant.forProject('project-1');
        const p2 = tenant.forProject('project-2');
        const dflt = tenant; // forTenant resets to the tenant's default project
        // The same id `shared` exists independently in each project, plus a project-only id apiece.
        await p1.upsert([
          { id: 'shared', vector: [1, 0, 0], model: 'm1' },
          { id: 'only-1', vector: [0, 1, 0], model: 'm1' },
        ]);
        await p2.upsert([
          { id: 'shared', vector: [0, 0, 1], model: 'm2' },
          { id: 'only-2', vector: [0, 1, 0], model: 'm2' },
        ]);
        await dflt.upsert([{ id: 'in-default', vector: [1, 0, 0], model: 'md' }]);

        // p1 sees only its own rows; `shared` resolves to p1's vector/model, never p2's or default's.
        const p1Matches = await p1.query([1, 0, 0], 5);
        expect(p1Matches.map((m) => m.id).sort()).toEqual(['only-1', 'shared']);
        expect(p1Matches.find((m) => m.id === 'shared')?.model).toBe('m1');

        // p2 sees only its own rows; the same id `shared` resolves to p2's vector/model.
        const p2Matches = await p2.query([0, 0, 1], 5);
        expect(p2Matches.map((m) => m.id).sort()).toEqual(['only-2', 'shared']);
        expect(p2Matches.find((m) => m.id === 'shared')?.model).toBe('m2');

        // The tenant's default project is a third, disjoint scope.
        expect((await dflt.query([1, 0, 0], 5)).map((m) => m.id)).toEqual(['in-default']);

        // Deleting in p1 does not touch p2 or the default project.
        await p1.delete(['shared', 'only-1']);
        expect(await p1.query([1, 0, 0], 5)).toHaveLength(0);
        expect((await p2.query([0, 0, 1], 5)).map((m) => m.id).sort()).toEqual([
          'only-2',
          'shared',
        ]);
        expect((await dflt.query([1, 0, 0], 5)).map((m) => m.id)).toEqual(['in-default']);
      } finally {
        await cleanup();
      }
    });
  });
}
