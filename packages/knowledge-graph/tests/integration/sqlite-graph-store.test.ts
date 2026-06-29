import { describe, expect, it } from 'vitest';
import { createSqliteStore } from '@tessera/storage';
import { createKnowledgeGraphService } from '../../src/service/knowledge-graph-service';
import { createSqliteGraphStore } from '../../src/adapters/sqlite-graph-store';
import { runGraphStoreConformance } from '../conformance/graph-store.conformance';

// The SQLite GraphStore adapter (recursive-CTE traversal) must satisfy the shared contract.
runGraphStoreConformance('sqlite', () => {
  const sqlite = createSqliteStore({ path: ':memory:' });
  return Promise.resolve({
    store: createSqliteGraphStore(sqlite.db),
    cleanup: () => sqlite.close(),
  });
});

describe('knowledge-graph service over sqlite — static derivation + multi-hop get_effects', () => {
  it('derives static effect-links from imports and resolves transitive dependents via CTE', async () => {
    const sqlite = createSqliteStore({ path: ':memory:' });
    try {
      const service = createKnowledgeGraphService(createSqliteGraphStore(sqlite.db));
      for (const key of ['app.ts', 'service.ts', 'util.ts']) {
        await service.upsertNode({ kind: 'file', key, label: key });
      }
      // app imports service; service imports util.
      await service.upsertEdge({
        from: { kind: 'file', key: 'app.ts' },
        to: { kind: 'file', key: 'service.ts' },
        kind: 'imports',
      });
      await service.upsertEdge({
        from: { kind: 'file', key: 'service.ts' },
        to: { kind: 'file', key: 'util.ts' },
        kind: 'imports',
      });

      expect(await service.deriveStaticEffectLinks()).toBe(2);

      // Changing util.ts affects service.ts (1 hop) and app.ts (2 hops).
      const effects = await service.getEffects({ kind: 'file', key: 'util.ts' });
      expect(effects.map((hit) => hit.node.key)).toEqual(['service.ts', 'app.ts']);
      expect(effects[0]?.distance).toBe(1);
      expect(effects[1]?.distance).toBe(2);
    } finally {
      await sqlite.close();
    }
  });
});
