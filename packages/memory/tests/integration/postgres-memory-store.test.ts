import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  createPostgresStore,
  pgClientMigrationDb,
  runMigrations,
  withPgAdvisoryLock,
} from '@tessera/storage';
import {
  createPostgresMemoryStore,
  pgMemoryMigrations,
} from '../../src/adapters/postgres-memory-store';
import { createMemoryService } from '../../src/service/memory-service';
import { runMemoryStoreConformance } from '../conformance/memory-store.conformance';

// Guarded like the F-023 Postgres suites: `docker compose up -d postgres`, then
// TESSERA_TEST_POSTGRES=1. Offline machines skip and stay green.
const CONNECTION_STRING =
  process.env['DATABASE_URL'] ?? 'postgres://tessera:tessera@127.0.0.1:5432/tessera';
const enabled = process.env['TESSERA_TEST_POSTGRES'] === '1';

let schemaCounter = 0;

/**
 * A fresh Postgres schema per harness (ADR-0059 §3). Isolation via `search_path` rather than a
 * `tableName` option on the adapter — a test concern does not belong in a production constructor,
 * eleven adapters over.
 */
async function freshStore(): Promise<{
  store: ReturnType<typeof createPostgresMemoryStore>;
  cleanup: () => Promise<void>;
}> {
  schemaCounter += 1;
  const schema = `mem_${Date.now().toString(36)}_${schemaCounter}`;
  const admin = createPostgresStore({ connectionString: CONNECTION_STRING });
  await admin.db.execute(sql.raw(`CREATE SCHEMA ${schema}`));
  await admin.close();

  // A pool pinned to the schema — every pooled connection sets search_path on connect, so a query
  // cannot land on a client that is still pointed at `public`.
  const scoped = createPostgresStore({
    connectionString: `${CONNECTION_STRING}?options=-c%20search_path%3D${schema}`,
  });
  await withPgAdvisoryLock(scoped.pool, 0x7e55e7a_0000_0002n, async (client) => {
    await client.query(`SET search_path TO ${schema}`);
    await runMigrations(pgClientMigrationDb(client), pgMemoryMigrations);
  });

  return {
    store: createPostgresMemoryStore(scoped.db),
    cleanup: async () => {
      await scoped.db.execute(sql.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`));
      await scoped.close();
    },
  };
}

describe.skipIf(!enabled)('postgres memory store (TESSERA_TEST_POSTGRES=1)', () => {
  // The Postgres adapter must satisfy the SAME shared contract the SQLite adapter does,
  // including the tenant/project isolation cases.
  runMemoryStoreConformance('postgres', freshStore);

  it('round-trips a high-precision confidence exactly (double precision, not real)', async () => {
    // The value matters. A plain 0.85 does NOT discriminate: Postgres formats float4 with
    // shortest-round-trip text, so `0.85::real::text` is '0.85' and the column type is invisible.
    // float4 carries ~7 significant digits, so the difference only shows past that —
    // `0.123456789012345::real::text` is '0.12345679', while the SQLite adapter (float8) returns it
    // intact. Verified by mutation: switching the column to `real` turns this red and nothing else.
    const { store, cleanup } = await freshStore();
    try {
      const service = createMemoryService(store);
      const captured = await service.capture({
        kind: 'decision',
        title: 'Fractional',
        body: 'Confidence must survive the round trip at full width.',
        confidence: 0.123456789012345,
      });
      const read = await store.getById(captured.id);
      expect(read?.confidence).toBe(0.123456789012345);
    } finally {
      await cleanup();
    }
  });

  it('returns a real number from countCurrent (bigint arrives as a string)', async () => {
    const { store, cleanup } = await freshStore();
    try {
      const service = createMemoryService(store);
      await service.capture({ kind: 'decision', title: 'One', body: 'First.' });
      await service.capture({ kind: 'lesson', title: 'Two', body: 'Second.' });

      const total = await store.countCurrent();
      expect(total).toBe(2);
      expect(typeof total).toBe('number'); // node-postgres hands back '2' for count(*)
      expect(await store.countCurrent({ kind: 'lesson' })).toBe(1);
    } finally {
      await cleanup();
    }
  });
});
