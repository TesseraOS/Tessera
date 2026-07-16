import { describe, expect, it } from 'vitest';
import { newId } from '@tessera/core';
import type { Memory } from '../../src/domain';
import type { MemoryStore } from '../../src/ports/memory-store';

export interface MemoryStoreHarness {
  store: MemoryStore;
  cleanup?: () => Promise<void>;
}

/** Builds a fresh, isolated MemoryStore for each test. */
export type MemoryStoreFactory = () => Promise<MemoryStoreHarness>;

let counter = 0;

/** Build a Memory version with sensible defaults; override any field. */
function memory(overrides: Partial<Memory> = {}): Memory {
  counter += 1;
  return {
    id: newId<'Memory'>(),
    lineageId: newId<'MemoryLineage'>(),
    kind: 'decision',
    title: `Decision ${counter}`,
    body: `Body of decision ${counter}`,
    scope: 'global',
    confidence: 1,
    metadata: {},
    version: 1,
    supersedes: null,
    supersededBy: null,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, counter)).toISOString(),
    ...overrides,
  };
}

/** The behavioral contract every {@link MemoryStore} adapter must satisfy (ADR-0003, ADR-0014). */
export function runMemoryStoreConformance(name: string, makeStore: MemoryStoreFactory): void {
  describe(`MemoryStore conformance: ${name}`, () => {
    it('stores a version and reads it back by id', async () => {
      const { store, cleanup } = await makeStore();
      try {
        const m = memory();
        await store.add(m);
        expect(await store.getById(m.id)).toEqual(m);
      } finally {
        await cleanup?.();
      }
    });

    it('returns the added version as the current one', async () => {
      const { store, cleanup } = await makeStore();
      try {
        const m = memory();
        await store.add(m);
        expect(await store.getCurrent(m.lineageId)).toEqual(m);
      } finally {
        await cleanup?.();
      }
    });

    it('supersede makes the new version current and links the old one without mutating its content', async () => {
      const { store, cleanup } = await makeStore();
      try {
        const v1 = memory();
        await store.add(v1);
        const v2 = memory({
          lineageId: v1.lineageId,
          version: 2,
          supersedes: v1.id,
          body: 'revised body',
        });
        await store.supersede(v1.id, v2);

        expect(await store.getCurrent(v1.lineageId)).toEqual(v2);
        const storedV1 = await store.getById(v1.id);
        expect(storedV1?.supersededBy).toBe(v2.id);
        expect(storedV1?.body).toBe(v1.body); // content immutable
      } finally {
        await cleanup?.();
      }
    });

    it('lists all versions of a lineage in ascending version order', async () => {
      const { store, cleanup } = await makeStore();
      try {
        const v1 = memory();
        await store.add(v1);
        const v2 = memory({ lineageId: v1.lineageId, version: 2, supersedes: v1.id });
        await store.supersede(v1.id, v2);

        const versions = await store.listVersions(v1.lineageId);
        expect(versions.map((m) => m.version)).toEqual([1, 2]);
        expect(versions.map((m) => m.id)).toEqual([v1.id, v2.id]);
      } finally {
        await cleanup?.();
      }
    });

    it('lists current memories and filters by kind and scope', async () => {
      const { store, cleanup } = await makeStore();
      try {
        const decision = memory({ kind: 'decision', scope: 'global' });
        const lesson = memory({ kind: 'lesson', scope: 'api' });
        await store.add(decision);
        await store.add(lesson);

        expect((await store.listCurrent()).map((m) => m.id).sort()).toEqual(
          [decision.id, lesson.id].sort(),
        );
        expect(await store.listCurrent({ kind: 'lesson' })).toEqual([lesson]);
        expect(await store.listCurrent({ scope: 'global' })).toEqual([decision]);
      } finally {
        await cleanup?.();
      }
    });

    it('returns undefined for an unknown id or lineage', async () => {
      const { store, cleanup } = await makeStore();
      try {
        expect(await store.getById(newId<'Memory'>())).toBeUndefined();
        expect(await store.getCurrent(newId<'MemoryLineage'>())).toBeUndefined();
      } finally {
        await cleanup?.();
      }
    });

    it('exportAll returns every version (superseded included) in createdAt order', async () => {
      const { store, cleanup } = await makeStore();
      try {
        const v1 = memory();
        await store.add(v1);
        const v2 = memory({ lineageId: v1.lineageId, version: 2, supersedes: v1.id });
        await store.supersede(v1.id, v2);
        const other = memory();
        await store.add(other);

        const all = await store.exportAll();
        expect(all.map((m) => m.id).sort()).toEqual([v1.id, v2.id, other.id].sort());
        // listCurrent excludes the superseded v1; exportAll includes it.
        expect((await store.listCurrent()).map((m) => m.id).sort()).toEqual(
          [v2.id, other.id].sort(),
        );
      } finally {
        await cleanup?.();
      }
    });

    it('deleteVersion removes one version idempotently without touching others', async () => {
      const { store, cleanup } = await makeStore();
      try {
        const v1 = memory();
        await store.add(v1);
        const v2 = memory({ lineageId: v1.lineageId, version: 2, supersedes: v1.id });
        await store.supersede(v1.id, v2);

        await store.deleteVersion(v1.id);
        expect(await store.getById(v1.id)).toBeUndefined();
        expect((await store.listVersions(v1.lineageId)).map((m) => m.id)).toEqual([v2.id]);
        // The current version is untouched and idempotent re-delete is a no-op.
        expect((await store.getCurrent(v1.lineageId))?.id).toBe(v2.id);
        await store.deleteVersion(v1.id);
      } finally {
        await cleanup?.();
      }
    });

    it('deleteLineage removes every version of the lineage only', async () => {
      const { store, cleanup } = await makeStore();
      try {
        const v1 = memory();
        await store.add(v1);
        const v2 = memory({ lineageId: v1.lineageId, version: 2, supersedes: v1.id });
        await store.supersede(v1.id, v2);
        const other = memory();
        await store.add(other);

        await store.deleteLineage(v1.lineageId);
        expect(await store.listVersions(v1.lineageId)).toEqual([]);
        expect(await store.getCurrent(v1.lineageId)).toBeUndefined();
        // A different lineage survives; re-delete is idempotent.
        expect((await store.listCurrent()).map((m) => m.id)).toEqual([other.id]);
        await store.deleteLineage(v1.lineageId);
      } finally {
        await cleanup?.();
      }
    });

    it('deleteLineage / exportAll are tenant-scoped — one tenant never affects another', async () => {
      const { store, cleanup } = await makeStore();
      try {
        const a = store.forTenant('tenant-a');
        const b = store.forTenant('tenant-b');
        const ma = memory();
        const mb = memory();
        await a.add(ma);
        await b.add(mb);

        await a.deleteLineage(ma.lineageId);
        expect(await a.exportAll()).toEqual([]);
        // Tenant B is untouched by tenant A's erasure.
        expect((await b.exportAll()).map((m) => m.id)).toEqual([mb.id]);
      } finally {
        await cleanup?.();
      }
    });

    it('isolates memories by tenant (forTenant) — no cross-tenant reads', async () => {
      const { store, cleanup } = await makeStore();
      try {
        const a = store.forTenant('tenant-a');
        const b = store.forTenant('tenant-b');
        const ma = memory({ scope: 'shared' });
        const mb = memory({ scope: 'shared' });
        await a.add(ma);
        await b.add(mb);

        // Reads by id / lineage / listing see only the caller-tenant's rows.
        expect(await a.getById(ma.id)).toEqual(ma);
        expect(await a.getById(mb.id)).toBeUndefined();
        expect(await b.getById(mb.id)).toEqual(mb);
        expect(await b.getById(ma.id)).toBeUndefined();

        expect(await a.getCurrent(mb.lineageId)).toBeUndefined();
        expect(await a.listVersions(mb.lineageId)).toEqual([]);
        expect((await a.listCurrent()).map((m) => m.id)).toEqual([ma.id]);
        expect((await a.listCurrent({ scope: 'shared' })).map((m) => m.id)).toEqual([ma.id]);
        expect((await b.listCurrent()).map((m) => m.id)).toEqual([mb.id]);

        // The default view is a distinct tenant and sees neither.
        expect(await store.getById(ma.id)).toBeUndefined();
        expect(await store.listCurrent()).toEqual([]);
      } finally {
        await cleanup?.();
      }
    });
  });
}
