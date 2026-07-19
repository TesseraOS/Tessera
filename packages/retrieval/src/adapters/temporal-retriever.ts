import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import {
  DEFAULT_PROJECT_ID,
  DEFAULT_TENANT_ID,
  ValidationError,
  type ProjectId,
  type TenantId,
} from '@tessera/core';
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
  /** A view confined to `tenantId` (FR-52), reset to its default project; scopes index/remove/retrieve. */
  forTenant(tenantId: TenantId): TemporalRetriever;
  /** A view confined to `projectId` within the current tenant (FR-66); scopes index/remove/retrieve. */
  forProject(projectId: ProjectId): TemporalRetriever;
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
 * `retrieval_temporal(ref, tenant, ts)` table (mirroring the keyword retriever's owned index) and, per
 * query, returns the most-recent refs — ordered newest-first and scored by **exponential recency
 * decay** (`2^(-age/halfLife)`, in `(0, 1]`), optionally restricted to a time window. The query text is
 * not matched (recency is query-independent); fusion combines this ordering with the lexical/semantic
 * signals. The clock is injected so scoring is deterministic in tests.
 *
 * **Scope (FR-52/FR-66, ADR-0033/0037):** every row carries a `tenant` + `project` (part of the
 * composite primary key `(tenant, project, ref)`). The base retriever operates in
 * `(DEFAULT_TENANT_ID, DEFAULT_PROJECT_ID)`; {@link TemporalRetriever.forTenant}/
 * {@link TemporalRetriever.forProject} rebind it and filter every read/write by both. The index is
 * derived/rebuildable, so a pre-existing table without `project` is dropped + recreated.
 */
export function createTemporalRetriever(options: TemporalRetrieverOptions): TemporalRetriever {
  const { db } = options;
  const tableName = options.table ?? 'retrieval_temporal';
  const table = sql.identifier(tableName);
  const now = options.now ?? Date.now;
  const halfLifeMs = options.halfLifeMs ?? DEFAULT_TEMPORAL_HALF_LIFE_MS;
  const { windowMs } = options;
  ensureTemporalSchema(db, table);

  /** Exponential recency weight in `(0, 1]`; future/now → 1, decaying by half every `halfLifeMs`. */
  function recencyWeight(ageMs: number): number {
    return 2 ** (-Math.max(0, ageMs) / halfLifeMs);
  }

  function storeFor(tenantId: TenantId, projectId: ProjectId): TemporalRetriever {
    return {
      kind: 'temporal',

      index(ref, timestamp) {
        const ts = toEpochMs(timestamp);
        db.run(
          sql`INSERT INTO ${table}(ref, tenant, project, ts) VALUES (${ref}, ${tenantId}, ${projectId}, ${ts})
              ON CONFLICT(tenant, project, ref) DO UPDATE SET ts = excluded.ts`,
        );
      },

      remove(ref) {
        db.run(
          sql`DELETE FROM ${table} WHERE ref = ${ref} AND tenant = ${tenantId} AND project = ${projectId}`,
        );
      },

      retrieve(query) {
        const limit = query.limit ?? DEFAULT_RETRIEVAL_LIMIT;
        const currentMs = now();
        const minTs = windowMs === undefined ? Number.MIN_SAFE_INTEGER : currentMs - windowMs;
        const rows = db.all<{ ref: string; ts: number }>(sql`
          SELECT ref, ts FROM ${table}
          WHERE tenant = ${tenantId} AND project = ${projectId} AND ts >= ${minTs}
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

      forTenant(next) {
        return storeFor(next, DEFAULT_PROJECT_ID);
      },

      forProject(next) {
        return storeFor(tenantId, next);
      },
    };
  }

  return storeFor(DEFAULT_TENANT_ID, DEFAULT_PROJECT_ID);
}

/**
 * Ensure the temporal table has the scope-aware schema (composite PK `(tenant, project, ref)`). A
 * pre-existing table without the `project` column is dropped + recreated — the index is
 * derived/rebuildable.
 */
function ensureTemporalSchema(
  db: BetterSQLite3Database,
  table: ReturnType<typeof sql.identifier>,
): void {
  const columns = db.all<{ name: string }>(sql`PRAGMA table_info(${table})`);
  if (columns.length > 0 && !columns.some((column) => column.name === 'project')) {
    db.run(sql`DROP TABLE ${table}`);
  }
  db.run(
    sql`CREATE TABLE IF NOT EXISTS ${table} (
      ref TEXT NOT NULL,
      tenant TEXT NOT NULL DEFAULT '${sql.raw(DEFAULT_TENANT_ID)}',
      project TEXT NOT NULL DEFAULT '${sql.raw(DEFAULT_PROJECT_ID)}',
      ts INTEGER NOT NULL,
      PRIMARY KEY (tenant, project, ref)
    )`,
  );
}
