import pg from 'pg';
import { describe } from 'vitest';
import { createPgVectorStore } from '../../src/adapters/pgvector/index';
import { runVectorConformance } from '../conformance/vector.conformance';

// Guarded (F-005 pattern): runs only against a reachable pgvector Postgres.
// `docker compose up -d postgres`, then run with TESSERA_TEST_POSTGRES=1.
const CONNECTION_STRING =
  process.env['DATABASE_URL'] ?? 'postgres://tessera:tessera@127.0.0.1:5432/tessera';
const enabled = process.env['TESSERA_TEST_POSTGRES'] === '1';

/** Drop a per-test table via a short-lived admin pool (the store's pool is being closed). */
async function dropTable(table: string): Promise<void> {
  const admin = new pg.Pool({ connectionString: CONNECTION_STRING });
  try {
    await admin.query(`DROP TABLE IF EXISTS ${table}`);
  } finally {
    await admin.end();
  }
}

describe.skipIf(!enabled)('pgvector (TESSERA_TEST_POSTGRES=1)', () => {
  // The pgvector adapter must satisfy the shared VectorStore contract. Each store gets its own
  // table so concurrent/sequential conformance cases stay isolated; cleanup drops it.
  runVectorConformance('pgvector', async ({ dimension, metric }) => {
    const table = `vectors_${Math.random().toString(36).slice(2, 10)}`;
    const store = createPgVectorStore(
      metric === undefined
        ? { connectionString: CONNECTION_STRING, dimension, table }
        : { connectionString: CONNECTION_STRING, dimension, metric, table },
    );
    return {
      store,
      cleanup: async () => {
        await store.close();
        await dropTable(table);
      },
    };
  });
});
