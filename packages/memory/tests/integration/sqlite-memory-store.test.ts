import { describe, expect, it } from 'vitest';
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
