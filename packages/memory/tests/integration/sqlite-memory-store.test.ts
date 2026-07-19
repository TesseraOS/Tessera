import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createSqliteStore } from '@tessera/storage';
import { createMemoryService } from '../../src/service/memory-service';
import { createSqliteMemoryStore } from '../../src/adapters/sqlite-memory-store';
import { runMemoryStoreConformance } from '../conformance/memory-store.conformance';

// The SQLite MemoryStore adapter must satisfy the shared contract.
runMemoryStoreConformance('sqlite', () => {
  const sqlite = createSqliteStore({ path: ':memory:' });
  return Promise.resolve({
    store: createSqliteMemoryStore(sqlite.db),
    cleanup: () => sqlite.close(),
  });
});

describe('memory service over sqlite — capture/edit/history persists across versions', () => {
  it('persists a capture, a superseding edit, and the full history', async () => {
    const sqlite = createSqliteStore({ path: ':memory:' });
    try {
      const service = createMemoryService(createSqliteMemoryStore(sqlite.db));

      const created = await service.capture({
        kind: 'decision',
        title: 'Adopt sqlite-vec',
        body: 'Local-first vector store',
        metadata: { source: 'adr:0006', tags: ['storage'] },
      });
      expect(created.version).toBe(1);

      const edited = await service.edit(created.lineageId, {
        body: 'Local-first vector store (vec0)',
      });
      expect(edited.version).toBe(2);
      expect(edited.supersedes).toBe(created.id);

      const current = await service.getCurrent(created.lineageId);
      expect(current?.id).toBe(edited.id);
      expect(current?.body).toBe('Local-first vector store (vec0)');
      expect(current?.metadata).toEqual({ source: 'adr:0006', tags: ['storage'] });

      // The original version is read back unchanged through a fresh store over the same db.
      const original = await createSqliteMemoryStore(sqlite.db).getById(created.id);
      expect(original?.body).toBe('Local-first vector store'); // original immutable
      expect(original?.supersededBy).toBe(edited.id);

      const history = await service.history(created.lineageId);
      expect(history.map((memory) => memory.version)).toEqual([1, 2]);
    } finally {
      await sqlite.close();
    }
  });
});

describe('project-scope migration (F-050) — additive, existing rows land in the default project', () => {
  it('assigns a pre-project row to the default project and reads it back unchanged', async () => {
    const sqlite = createSqliteStore({ path: ':memory:' });
    try {
      // A pre-F-050 `memories` table: it has the F-037 tenant_id column but NO project_id column.
      sqlite.db.run(
        sql`CREATE TABLE memories (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL DEFAULT 'default',
          lineage_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          scope TEXT NOT NULL,
          confidence REAL NOT NULL,
          metadata TEXT NOT NULL,
          version INTEGER NOT NULL,
          supersedes TEXT,
          superseded_by TEXT,
          created_at TEXT NOT NULL
        )`,
      );
      sqlite.db.run(
        sql`INSERT INTO memories
          (id, tenant_id, lineage_id, kind, title, body, scope, confidence, metadata, version, superseded_by, created_at)
          VALUES ('m1', 'default', 'lin1', 'decision', 'Legacy', 'pre-project body', 'global', 1, '{}', 1, NULL, '2026-01-01T00:00:00.000Z')`,
      );

      // Constructing the store runs the additive migration (adds project_id DEFAULT 'default').
      const store = createSqliteMemoryStore(sqlite.db);

      // The existing row is now readable in the default project — assigned, not lost.
      const migrated = await store.getById('m1' as never);
      expect(migrated?.body).toBe('pre-project body');
      expect((await store.listCurrent()).map((m) => m.id)).toEqual(['m1']);

      // And it is scoped: it does NOT appear under a non-default project of the same tenant.
      expect(await store.forProject('project-1').listCurrent()).toEqual([]);
    } finally {
      await sqlite.close();
    }
  });
});
