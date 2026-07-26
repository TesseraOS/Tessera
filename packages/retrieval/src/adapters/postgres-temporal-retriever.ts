import {
  DEFAULT_PROJECT_ID,
  DEFAULT_TENANT_ID,
  type ProjectId,
  type TenantId,
} from '@tessera/core';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DEFAULT_RETRIEVAL_LIMIT, type Candidate } from '../domain.js';
import {
  DEFAULT_TEMPORAL_HALF_LIFE_MS,
  temporalRecencyWeight,
  toEpochMs,
  type TemporalRetriever,
} from './temporal-retriever.js';

/**
 * Schema for the Postgres temporal index (F-056, ADR-0059 §2).
 *
 * `ts` is `bigint` because it holds epoch **milliseconds**, which passed 2^31 in 1970 + 24 days —
 * an `integer` column would overflow on every real timestamp. It is read back through `Number(...)`
 * at the one place it is used, since node-postgres returns bigint as a string.
 */
export const pgTemporalMigrations: readonly { id: string; up: readonly string[] }[] = [
  {
    id: 'f056-temporal-index-001',
    up: [
      `CREATE TABLE IF NOT EXISTS retrieval_temporal (
        ref text NOT NULL,
        tenant text NOT NULL DEFAULT '${DEFAULT_TENANT_ID}',
        project text NOT NULL DEFAULT '${DEFAULT_PROJECT_ID}',
        ts bigint NOT NULL,
        PRIMARY KEY (tenant, project, ref)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_temporal_scope_ts
         ON retrieval_temporal (tenant, project, ts DESC)`,
    ],
  },
];

export interface PostgresTemporalRetrieverOptions {
  readonly db: NodePgDatabase;
  /** Clock, injected for deterministic tests (default `Date.now`). */
  readonly now?: () => number;
  /** Recency decay half-life in ms (default {@link DEFAULT_TEMPORAL_HALF_LIFE_MS}). */
  readonly halfLifeMs?: number;
  /** Optional max age in ms: items older than this are excluded (default: no window). */
  readonly windowMs?: number;
}

/**
 * Postgres {@link TemporalRetriever} — the self-hosted twin of the SQLite adapter, behind the
 * identical port and conformance suite.
 *
 * Timestamp normalization ({@link toEpochMs}) and the decay curve ({@link temporalRecencyWeight}) are
 * **imported, not reimplemented**: the fusion ranker combines scores across retrievers, so a
 * different curve here would rank the same corpus differently per deployment profile.
 *
 * **Tables must already exist** ({@link pgTemporalMigrations}).
 */
export function createPostgresTemporalRetriever(
  options: PostgresTemporalRetrieverOptions,
): TemporalRetriever {
  const { db } = options;
  const now = options.now ?? Date.now;
  const halfLifeMs = options.halfLifeMs ?? DEFAULT_TEMPORAL_HALF_LIFE_MS;
  const { windowMs } = options;

  function storeFor(tenantId: TenantId, projectId: ProjectId): TemporalRetriever {
    return {
      kind: 'temporal',

      async index(ref, timestamp) {
        // Throws a ValidationError for unparseable input, before touching the database — the same
        // trust boundary the SQLite adapter enforces.
        const ts = toEpochMs(timestamp);
        await db.execute(sql`
          INSERT INTO retrieval_temporal (ref, tenant, project, ts)
          VALUES (${ref}, ${tenantId}, ${projectId}, ${ts})
          ON CONFLICT (tenant, project, ref) DO UPDATE SET ts = excluded.ts
        `);
      },

      async remove(ref) {
        await db.execute(sql`
          DELETE FROM retrieval_temporal
          WHERE ref = ${ref} AND tenant = ${tenantId} AND project = ${projectId}
        `);
      },

      async retrieve(query) {
        const limit = query.limit ?? DEFAULT_RETRIEVAL_LIMIT;
        const currentMs = now();
        const minTs = windowMs === undefined ? Number.MIN_SAFE_INTEGER : currentMs - windowMs;

        const result = await db.execute(sql`
          SELECT ref, ts FROM retrieval_temporal
          WHERE tenant = ${tenantId} AND project = ${projectId} AND ts >= ${minTs}
          ORDER BY ts DESC, ref ASC
          LIMIT ${limit}
        `);

        return (result.rows as { ref: string; ts: string | number }[]).map((row): Candidate => ({
          ref: row.ref,
          signal: 'temporal',
          // `Number(...)`: node-postgres hands back a bigint column as a string.
          score: temporalRecencyWeight(currentMs - Number(row.ts), halfLifeMs),
        }));
      },

      forTenant(next: TenantId) {
        return storeFor(next, DEFAULT_PROJECT_ID);
      },

      forProject(next: ProjectId) {
        return storeFor(tenantId, next);
      },
    };
  }

  return storeFor(DEFAULT_TENANT_ID, DEFAULT_PROJECT_ID);
}
