import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  createPostgresStore,
  pgClientMigrationDb,
  runMigrations,
  withPgAdvisoryLock,
} from '@tessera/storage';
import {
  createPostgresGraphStore,
  pgGraphMigrations,
} from '../../src/adapters/postgres-graph-store';
import { EFFECT_LINK_KIND, edgeIdFor, nodeIdFor } from '../../src/domain';
import { runGraphStoreConformance } from '../conformance/graph-store.conformance';

// Guarded like the F-023 Postgres suites: `docker compose up -d postgres`, then
// TESSERA_TEST_POSTGRES=1. Offline machines skip and stay green.
const CONNECTION_STRING =
  process.env['DATABASE_URL'] ?? 'postgres://tessera:tessera@127.0.0.1:5432/tessera';
const enabled = process.env['TESSERA_TEST_POSTGRES'] === '1';

let schemaCounter = 0;

/** A fresh Postgres schema per harness (ADR-0059 §3), migrated before use. */
async function freshStore(): Promise<{
  store: ReturnType<typeof createPostgresGraphStore>;
  cleanup: () => Promise<void>;
}> {
  schemaCounter += 1;
  const schema = `kg_${Date.now().toString(36)}_${schemaCounter}`;
  const admin = createPostgresStore({ connectionString: CONNECTION_STRING });
  await admin.db.execute(sql.raw(`CREATE SCHEMA ${schema}`));
  await admin.close();

  const scoped = createPostgresStore({
    connectionString: `${CONNECTION_STRING}?options=-c%20search_path%3D${schema}`,
  });
  await withPgAdvisoryLock(scoped.pool, 0x7e55e7a_0000_0003n, async (client) => {
    await client.query(`SET search_path TO ${schema}`);
    await runMigrations(pgClientMigrationDb(client), pgGraphMigrations);
  });

  return {
    store: createPostgresGraphStore(scoped.db),
    cleanup: async () => {
      await scoped.db.execute(sql.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`));
      await scoped.close();
    },
  };
}

describe.skipIf(!enabled)('postgres graph store (TESSERA_TEST_POSTGRES=1)', () => {
  // The SAME shared contract the SQLite and in-memory adapters satisfy, including the
  // tenant/project isolation cases and the effect-link traversal.
  runGraphStoreConformance('postgres', freshStore);

  it('terminates on a cycle instead of recursing forever', async () => {
    // The CTE's cycle guard is `strpos(path, '|' || to_id || '|') = 0` — Postgres' spelling of the
    // SQLite adapter's `instr`. If it were wrong, this would not fail with a bad value; it would hang
    // or exhaust memory, which is why it gets its own test rather than trusting the shared suite.
    const { store, cleanup } = await freshStore();
    const a = nodeIdFor('file', 'a.ts');
    const b = nodeIdFor('file', 'b.ts');
    try {
      await store.addNode({ id: a, kind: 'file', key: 'a.ts', label: 'a', metadata: {} });
      await store.addNode({ id: b, kind: 'file', key: 'b.ts', label: 'b', metadata: {} });
      for (const [from, to] of [
        [a, b],
        [b, a],
      ] as const) {
        await store.addEdge({
          id: edgeIdFor(from, to, EFFECT_LINK_KIND),
          from,
          to,
          kind: EFFECT_LINK_KIND,
          rationale: null,
          confidence: null,
          origin: null,
          metadata: {},
        });
      }

      const hits = await store.getEffects(a);
      // b is reachable; a is the source and must not come back as its own effect.
      expect(hits.map((hit) => hit.node.key)).toEqual(['b.ts']);
    } finally {
      await cleanup();
    }
  });
});
