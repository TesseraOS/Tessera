import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { DEFAULT_TENANT_ID, type TenantId } from '@tessera/core';
import { DEFAULT_RETRIEVAL_LIMIT, type Candidate } from '../domain.js';
import type { Retriever } from '../ports/retriever.js';
import { extractTerms } from '../util/text.js';

export interface KeywordRetrieverOptions {
  /** A SQLite Drizzle handle (e.g. the storage SqliteStore's `db`). */
  readonly db: BetterSQLite3Database;
  /** FTS5 table name (default `retrieval_fts`). */
  readonly table?: string;
}

/** A keyword retriever that also owns the FTS index it queries. */
export interface KeywordRetriever extends Retriever {
  /** Index (or re-index) an item's text under `ref`. Ingestion populates this in production. */
  index(ref: string, content: string): void;
  /** A view confined to `tenantId` (FR-52); scopes both `index` and `retrieve`. */
  forTenant(tenantId: TenantId): KeywordRetriever;
}

/** Build an FTS5 MATCH expression from query terms (quoted to avoid FTS operator injection). */
function toMatchExpression(terms: readonly string[]): string {
  return terms.map((term) => `"${term.replace(/"/g, '""')}"`).join(' OR ');
}

/**
 * Keyword/lexical retriever over SQLite **FTS5** (FR-22). Ranked by `bm25` (best first). Owns a
 * `ref UNINDEXED, tenant UNINDEXED, content` virtual table; `index(ref, content)` upserts a row (FTS5
 * has no upsert, so it deletes-then-inserts by ref within the tenant).
 *
 * **Tenancy (FR-52, ADR-0033):** the store the factory returns indexes/queries the
 * {@link DEFAULT_TENANT_ID}; {@link KeywordRetriever.forTenant} rebinds it and filters every MATCH by
 * `tenant`, so keyword hits never cross tenants. The FTS index is a derived, rebuildable index, so a
 * pre-existing table without the `tenant` column is dropped + recreated (never a data loss of record).
 */
export function createKeywordRetriever(options: KeywordRetrieverOptions): KeywordRetriever {
  const { db } = options;
  const tableName = options.table ?? 'retrieval_fts';
  const table = sql.identifier(tableName);
  ensureFtsSchema(db, tableName, table);

  function storeFor(tenantId: TenantId): KeywordRetriever {
    return {
      kind: 'keyword',

      index(ref, content) {
        db.run(sql`DELETE FROM ${table} WHERE ref = ${ref} AND tenant = ${tenantId}`);
        db.run(
          sql`INSERT INTO ${table}(ref, tenant, content) VALUES (${ref}, ${tenantId}, ${content})`,
        );
      },

      retrieve(query) {
        const limit = query.limit ?? DEFAULT_RETRIEVAL_LIMIT;
        const terms = extractTerms(query.text);
        if (terms.length === 0) return Promise.resolve([]);
        const rows = db.all<{ ref: string }>(sql`
          SELECT ref FROM ${table}
          WHERE ${table} MATCH ${toMatchExpression(terms)} AND tenant = ${tenantId}
          ORDER BY bm25(${table})
          LIMIT ${limit}
        `);
        return Promise.resolve(
          rows.map((row, index): Candidate => ({
            ref: row.ref,
            signal: 'keyword',
            score: 1 / (1 + index),
          })),
        );
      },

      forTenant(next) {
        return storeFor(next);
      },
    };
  }

  return storeFor(DEFAULT_TENANT_ID);
}

/**
 * Ensure the FTS5 table has the tenant-aware schema. Creates it when absent; if a pre-existing table
 * lacks the `tenant` column, drops + recreates it (the FTS index is derived/rebuildable — ingestion
 * repopulates it — so this is safe and avoids the impossible ALTER of an FTS5 virtual table).
 */
function ensureFtsSchema(
  db: BetterSQLite3Database,
  tableName: string,
  table: ReturnType<typeof sql.identifier>,
): void {
  const columns = db.all<{ name: string }>(sql`PRAGMA table_info(${table})`);
  if (columns.length > 0 && !columns.some((column) => column.name === 'tenant')) {
    db.run(sql`DROP TABLE ${table}`);
  }
  db.run(
    sql`CREATE VIRTUAL TABLE IF NOT EXISTS ${table} USING fts5(ref UNINDEXED, tenant UNINDEXED, content)`,
  );
}
