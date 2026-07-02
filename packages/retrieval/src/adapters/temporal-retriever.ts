import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { ValidationError } from '@tessera/core';
import { DEFAULT_RETRIEVAL_LIMIT, type Candidate } from '../domain.js';
import type { Retriever } from '../ports/retriever.js';

/** Default recency half-life: an item ~30 days old scores 0.5 (tunable per source). */
export const DEFAULT_TEMPORAL_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000;

/** A timestamp accepted by {@link TemporalRetriever.index}: epoch **milliseconds**, ISO string, or Date. */
export type TemporalTimestamp = number | string | Date;

export interface TemporalRetrieverOptions {
  /** A SQLite Drizzle handle (e.g. the storage SqliteStore's `db`). */
  readonly db: BetterSQLite3Database;
  /** Table name (default `retrieval_temporal`). */
  readonly table?: string;
  /** Clock, injected for deterministic tests (default `Date.now`). */
  readonly now?: () => number;
  /** Recency decay half-life in ms (default {@link DEFAULT_TEMPORAL_HALF_LIFE_MS}). */
  readonly halfLifeMs?: number;
  /** Optional max age in ms: items older than this are excluded (default: no window). */
  readonly windowMs?: number;
}

/** A temporal retriever that also owns the timestamp index it queries. */
export interface TemporalRetriever extends Retriever {
  /** Record (or update) an item's timestamp under `ref`. Ingestion populates this in production. */
  index(ref: string, timestamp: TemporalTimestamp): void;
  /** Drop an item's timestamp. */
  remove(ref: string): void;
}

/** Normalize a timestamp to epoch milliseconds, rejecting invalid input at the trust boundary. */
function toEpochMs(timestamp: TemporalTimestamp): number {
  const millis =
    timestamp instanceof Date
      ? timestamp.getTime()
      : typeof timestamp === 'number'
        ? timestamp
        : Date.parse(timestamp);
  if (!Number.isFinite(millis)) {
    throw new ValidationError('invalid temporal timestamp', { details: { timestamp } });
  }
  return millis;
}

/**
 * Temporal/recency retriever (FR-24): a recency **prior** over the corpus. It owns a
 * `retrieval_temporal(ref, ts)` table (mirroring the keyword retriever's owned FTS index) and, per
 * query, returns the most-recent refs — ordered newest-first and scored by **exponential recency
 * decay** (`2^(-age/halfLife)`, in `(0, 1]`), optionally restricted to a time window. The query text is
 * not matched (recency is query-independent); fusion combines this ordering with the lexical/semantic
 * signals. The clock is injected so scoring is deterministic in tests.
 */
export function createTemporalRetriever(options: TemporalRetrieverOptions): TemporalRetriever {
  const { db } = options;
  const table = sql.identifier(options.table ?? 'retrieval_temporal');
  const now = options.now ?? Date.now;
  const halfLifeMs = options.halfLifeMs ?? DEFAULT_TEMPORAL_HALF_LIFE_MS;
  const { windowMs } = options;
  db.run(sql`CREATE TABLE IF NOT EXISTS ${table} (ref TEXT PRIMARY KEY, ts INTEGER NOT NULL)`);

  /** Exponential recency weight in `(0, 1]`; future/now → 1, decaying by half every `halfLifeMs`. */
  function recencyWeight(ageMs: number): number {
    return 2 ** (-Math.max(0, ageMs) / halfLifeMs);
  }

  return {
    kind: 'temporal',

    index(ref, timestamp) {
      const ts = toEpochMs(timestamp);
      db.run(
        sql`INSERT INTO ${table}(ref, ts) VALUES (${ref}, ${ts})
            ON CONFLICT(ref) DO UPDATE SET ts = excluded.ts`,
      );
    },

    remove(ref) {
      db.run(sql`DELETE FROM ${table} WHERE ref = ${ref}`);
    },

    retrieve(query) {
      const limit = query.limit ?? DEFAULT_RETRIEVAL_LIMIT;
      const currentMs = now();
      const minTs = windowMs === undefined ? Number.MIN_SAFE_INTEGER : currentMs - windowMs;
      const rows = db.all<{ ref: string; ts: number }>(sql`
        SELECT ref, ts FROM ${table}
        WHERE ts >= ${minTs}
        ORDER BY ts DESC, ref ASC
        LIMIT ${limit}
      `);
      return Promise.resolve(
        rows.map((row): Candidate => ({
          ref: row.ref,
          signal: 'temporal',
          score: recencyWeight(currentMs - row.ts),
        })),
      );
    },
  };
}
