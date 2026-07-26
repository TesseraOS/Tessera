import {
  DEFAULT_PROJECT_ID,
  DEFAULT_TENANT_ID,
  type ProjectId,
  type TenantId,
} from '@tessera/core';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DEFAULT_RETRIEVAL_LIMIT, type Candidate } from '../domain.js';
import type { KeywordRetriever } from './keyword-retriever.js';

/**
 * Schema for the Postgres keyword index (F-056, ADR-0059 §2) — the self-hosted counterpart to
 * SQLite's FTS5 virtual table.
 *
 * The `tsvector` is a **generated stored column**, not one the adapter writes: that way the index can
 * never disagree with the text it indexes, which is exactly the drift an application-maintained
 * search column accumulates. The GIN index over it is what makes `@@` a lookup rather than a scan.
 *
 * The text-search configuration is pinned to `'english'` rather than left to `default_text_search_config`,
 * because that setting is per-database and an operator changing it would silently alter stemming — and
 * a generated column's expression must be immutable anyway, so Postgres would reject the unpinned form.
 */
export const pgKeywordMigrations: readonly { id: string; up: readonly string[] }[] = [
  {
    id: 'f056-keyword-index-001',
    up: [
      `CREATE TABLE IF NOT EXISTS keyword_index (
        ref text NOT NULL,
        tenant text NOT NULL DEFAULT '${DEFAULT_TENANT_ID}',
        project text NOT NULL DEFAULT '${DEFAULT_PROJECT_ID}',
        content text NOT NULL,
        content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
        PRIMARY KEY (tenant, project, ref)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_keyword_tsv ON keyword_index USING GIN (content_tsv)`,
    ],
  },
];

export interface PostgresKeywordRetrieverOptions {
  readonly db: NodePgDatabase;
}

/**
 * Postgres full-text {@link KeywordRetriever} — the self-hosted twin of the SQLite FTS5 adapter,
 * behind the identical port and the identical conformance suite.
 *
 * `plainto_tsquery` gives SQLite's practical behaviour for a bag of words (all terms must match)
 * without exposing tsquery operator syntax to a caller who typed a sentence — a user query containing
 * `&` or `!` would otherwise be a syntax error rather than a search.
 *
 * **Scores are rank-derived, not raw `ts_rank`**, deliberately: the SQLite adapter returns
 * `1 / (1 + index)` from its bm25 ordering, and the fusion ranker combines signals across retrievers.
 * Two adapters feeding differently-scaled scores into one fusion would rank the same corpus
 * differently per deployment profile. Same formula, so the ordering is the only thing that carries.
 *
 * **Tables must already exist** ({@link pgKeywordMigrations}).
 */
export function createPostgresKeywordRetriever(
  options: PostgresKeywordRetrieverOptions,
): KeywordRetriever {
  const { db } = options;

  function storeFor(tenantId: TenantId, projectId: ProjectId): KeywordRetriever {
    return {
      kind: 'keyword',

      async index(ref, content) {
        await db.execute(sql`
          INSERT INTO keyword_index (ref, tenant, project, content)
          VALUES (${ref}, ${tenantId}, ${projectId}, ${content})
          ON CONFLICT (tenant, project, ref) DO UPDATE SET content = excluded.content
        `);
      },

      async remove(ref) {
        await db.execute(sql`
          DELETE FROM keyword_index
          WHERE ref = ${ref} AND tenant = ${tenantId} AND project = ${projectId}
        `);
      },

      async retrieve(query) {
        const limit = query.limit ?? DEFAULT_RETRIEVAL_LIMIT;
        if (query.text.trim().length === 0) return [];

        const result = await db.execute(sql`
          SELECT ref
          FROM keyword_index, plainto_tsquery('english', ${query.text}) AS q
          WHERE tenant = ${tenantId} AND project = ${projectId} AND content_tsv @@ q
          ORDER BY ts_rank(content_tsv, q) DESC, ref ASC
          LIMIT ${limit}
        `);

        return (result.rows as { ref: string }[]).map((row, index): Candidate => ({
          ref: row.ref,
          signal: 'keyword',
          score: 1 / (1 + index),
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
