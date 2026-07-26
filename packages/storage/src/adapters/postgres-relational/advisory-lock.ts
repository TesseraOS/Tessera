import type pg from 'pg';

/**
 * Serialize a critical section across processes using a Postgres **session-scoped** advisory lock
 * (F-056, ADR-0059 §2).
 *
 * The motivating case is migrations. {@link import('../../migrations/runner.js').runMigrations} reads
 * the applied ids and *then* applies the pending ones; two replicas booting together both read an
 * empty `_tessera_migrations` and both apply. The runner is already idempotent by id, so the outcome
 * is usually survivable — but "usually" is not a property to ship a schema on, and concurrent DDL on
 * the same table is how a deploy wedges. This closes the window.
 *
 * `fn` receives **the same client that holds the lock**, and that is the whole point: `pg_advisory_lock`
 * belongs to a *session*, so work done on any other pooled connection is not protected by it. Callers
 * must use the supplied client rather than the pool.
 *
 * The lock is released in a `finally`, and the client is released to the pool in an outer `finally`.
 * If the process dies mid-section, Postgres drops the session and the lock with it — no manual
 * recovery, which is the main reason to prefer an advisory lock over a row in a table here.
 */
export async function withPgAdvisoryLock<T>(
  pool: pg.Pool,
  key: bigint,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    // Passed as a string: the key is int8, and a JS number cannot hold the full range.
    await client.query('SELECT pg_advisory_lock($1)', [key.toString()]);
    try {
      return await fn(client);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [key.toString()]);
    }
  } finally {
    client.release();
  }
}

/**
 * The advisory-lock key Tessera uses for its schema migrations. A fixed, arbitrary constant — it only
 * has to be stable across replicas and unlikely to collide with another application sharing the
 * database. Derived from "tessera" so it is recognisable in `pg_locks` during an incident.
 */
export const TESSERA_MIGRATION_LOCK_KEY = 0x7e55e7a_0000_0001n;
