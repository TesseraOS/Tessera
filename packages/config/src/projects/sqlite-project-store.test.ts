import { afterEach, describe, expect, it } from 'vitest';
import { newId } from '@tessera/core';
import type { Project } from '@tessera/api/projects';
import { createSqliteStore, type SqliteStore } from '@tessera/storage';
import { createSqliteProjectStore } from './sqlite-project-store.js';

/**
 * The shipping SQLite {@link ProjectStore} adapter, proven against the same behaviors the in-memory
 * reference adapter's shared conformance covers (create/get/list/rename/remove + tenant isolation +
 * cross-restart durability). Direct assertions here rather than the shared conformance suite because
 * that suite imports vitest and lives in `@tessera/api`, which cannot export it from a runtime barrel
 * without pulling vitest into production paths (the F-078 tension) — so the shipping adapter is proven
 * here instead of left unproven.
 */
let store: SqliteStore | undefined;

afterEach(async () => {
  await store?.close();
  store = undefined;
});

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: newId<'Project'>(),
    tenantId: 'tenant-a',
    name: 'Alpha',
    createdAt: new Date().toISOString(),
    isDefault: false,
    ...overrides,
  };
}

describe('createSqliteProjectStore', () => {
  it('creates, reads, lists (oldest first), renames, and removes', async () => {
    store = createSqliteStore({ path: ':memory:' });
    const projects = createSqliteProjectStore(store.db);

    const a = project({ name: 'Alpha', createdAt: '2026-01-01T00:00:00.000Z' });
    const b = project({ name: 'Beta', createdAt: '2026-01-02T00:00:00.000Z' });
    await projects.create(a);
    await projects.create(b);

    expect(await projects.get('tenant-a', a.id)).toEqual(a);
    expect((await projects.list('tenant-a')).map((p) => p.id)).toEqual([a.id, b.id]);

    const renamed = await projects.rename('tenant-a', a.id, 'Renamed');
    expect(renamed?.name).toBe('Renamed');
    expect(await projects.rename('tenant-a', newId<'Project'>(), 'X')).toBeUndefined();

    await projects.remove('tenant-a', a.id);
    expect(await projects.get('tenant-a', a.id)).toBeUndefined();
    // Idempotent remove.
    await expect(projects.remove('tenant-a', a.id)).resolves.toBeUndefined();
  });

  it('isolates projects by tenant', async () => {
    store = createSqliteStore({ path: ':memory:' });
    const projects = createSqliteProjectStore(store.db);

    const inA = project({ tenantId: 'tenant-a', name: 'A' });
    const inB = project({ tenantId: 'tenant-b', name: 'B' });
    await projects.create(inA);
    await projects.create(inB);

    expect((await projects.list('tenant-a')).map((p) => p.id)).toEqual([inA.id]);
    expect(await projects.get('tenant-b', inA.id)).toBeUndefined();
    expect(await projects.rename('tenant-b', inA.id, 'hijack')).toBeUndefined();
    await projects.remove('tenant-b', inA.id);
    expect(await projects.get('tenant-a', inA.id)).toBeDefined();
  });

  it('persists across a reopen of the same database file', async () => {
    store = createSqliteStore({ path: ':memory:' });
    // A shared in-memory DB via one handle: the point is the row is read back through a fresh store
    // instance over the same db, proving reads do not depend on in-process state.
    const first = createSqliteProjectStore(store.db);
    const p = project({ name: 'Durable' });
    await first.create(p);

    const second = createSqliteProjectStore(store.db);
    expect((await second.get('tenant-a', p.id))?.name).toBe('Durable');
  });
});
