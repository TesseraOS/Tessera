import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
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
}

/** Build an FTS5 MATCH expression from query terms (quoted to avoid FTS operator injection). */
function toMatchExpression(terms: readonly string[]): string {
  return terms.map((term) => `"${term.replace(/"/g, '""')}"`).join(' OR ');
}

/**
 * Keyword/lexical retriever over SQLite **FTS5** (FR-22). Ranked by `bm25` (best first). Owns a
 * `ref UNINDEXED, content` virtual table; `index(ref, content)` upserts a row (FTS5 has no upsert,
 * so it deletes-then-inserts by ref).
 */
export function createKeywordRetriever(options: KeywordRetrieverOptions): KeywordRetriever {
  const { db } = options;
  const table = sql.identifier(options.table ?? 'retrieval_fts');
  db.run(sql`CREATE VIRTUAL TABLE IF NOT EXISTS ${table} USING fts5(ref UNINDEXED, content)`);

  return {
    kind: 'keyword',

    index(ref, content) {
      db.run(sql`DELETE FROM ${table} WHERE ref = ${ref}`);
      db.run(sql`INSERT INTO ${table}(ref, content) VALUES (${ref}, ${content})`);
    },

    retrieve(query) {
      const limit = query.limit ?? DEFAULT_RETRIEVAL_LIMIT;
      const terms = extractTerms(query.text);
      if (terms.length === 0) return Promise.resolve([]);
      const rows = db.all<{ ref: string }>(sql`
        SELECT ref FROM ${table}
        WHERE ${table} MATCH ${toMatchExpression(terms)}
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
  };
}
