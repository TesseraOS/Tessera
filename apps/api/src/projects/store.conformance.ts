import { describe, expect, it } from 'vitest';
import { newId } from '@tessera/core';
import type { Project } from './model.js';
import type { ProjectStore } from './store.js';

export interface ProjectStoreHarness {
  store: ProjectStore;
  cleanup?: () => Promise<void>;
}

/** Builds a fresh, isolated {@link ProjectStore} per test. */
export type ProjectStoreFactory = () => Promise<ProjectStoreHarness>;

let counter = 0;

/** Build a stored (non-default) {@link Project}; override any field. */
function project(overrides: Partial<Project> = {}): Project {
  counter += 1;
  return {
    id: newId<'Project'>(),
    tenantId: 'tenant-a',
    name: `Project ${counter}`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, counter)).toISOString(),
    isDefault: false,
    ...overrides,
  };
}

/** The behavioral contract every {@link ProjectStore} adapter must satisfy (F-066, ADR-0037). */
export function runProjectStoreConformance(name: string, make: ProjectStoreFactory): void {
  describe(`ProjectStore conformance: ${name}`, () => {
    it('creates, reads, and lists projects (oldest first)', async () => {
      const { store, cleanup } = await make();
      try {
        const a = project({ name: 'Alpha' });
        const b = project({ name: 'Beta' });
        await store.create(a);
        await store.create(b);

        expect(await store.get('tenant-a', a.id)).toEqual(a);
        expect((await store.list('tenant-a')).map((p) => p.id)).toEqual([a.id, b.id]);
      } finally {
        await cleanup?.();
      }
    });

    it('renames a project, returning the updated record (undefined for an unknown id)', async () => {
      const { store, cleanup } = await make();
      try {
        const a = project({ name: 'Old' });
        await store.create(a);

        const renamed = await store.rename('tenant-a', a.id, 'New');
        expect(renamed?.name).toBe('New');
        expect((await store.get('tenant-a', a.id))?.name).toBe('New');
        expect(await store.rename('tenant-a', newId<'Project'>(), 'X')).toBeUndefined();
      } finally {
        await cleanup?.();
      }
    });

    it('removes a project idempotently', async () => {
      const { store, cleanup } = await make();
      try {
        const a = project();
        await store.create(a);
        await store.remove('tenant-a', a.id);
        expect(await store.get('tenant-a', a.id)).toBeUndefined();
        expect(await store.list('tenant-a')).toHaveLength(0);
        // Removing an unknown id is a no-op.
        await expect(store.remove('tenant-a', a.id)).resolves.toBeUndefined();
      } finally {
        await cleanup?.();
      }
    });

    it('isolates projects by tenant — no cross-tenant reads/mutations', async () => {
      const { store, cleanup } = await make();
      try {
        const inA = project({ tenantId: 'tenant-a', name: 'A' });
        const inB = project({ tenantId: 'tenant-b', name: 'B' });
        await store.create(inA);
        await store.create(inB);

        expect((await store.list('tenant-a')).map((p) => p.id)).toEqual([inA.id]);
        expect((await store.list('tenant-b')).map((p) => p.id)).toEqual([inB.id]);

        // Tenant B cannot see, rename, or remove tenant A's project.
        expect(await store.get('tenant-b', inA.id)).toBeUndefined();
        expect(await store.rename('tenant-b', inA.id, 'hijack')).toBeUndefined();
        await store.remove('tenant-b', inA.id);
        expect(await store.get('tenant-a', inA.id)).toBeDefined();
      } finally {
        await cleanup?.();
      }
    });
  });
}
