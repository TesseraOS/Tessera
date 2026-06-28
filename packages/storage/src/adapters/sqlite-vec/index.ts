import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { ValidationError } from '@tessera/core';
import type {
  VectorItem,
  VectorMatch,
  VectorMetric,
  VectorStore,
  VectorStoreCapabilities,
} from '../../ports/vector.js';

export interface SqliteVecStoreOptions {
  /** File path, or ':memory:' for an ephemeral index. */
  readonly path: string;
  /** Fixed embedding dimension. */
  readonly dimension: number;
  /** Distance metric (default 'l2'). */
  readonly metric?: VectorMetric;
  /** Virtual table name (default 'vectors'). */
  readonly table?: string;
}

interface MatchRow {
  id: string;
  distance: number;
  model: string;
}

/**
 * Local VectorStore backed by SQLite + the sqlite-vec extension (ADR-0006). Stores vectors in a
 * `vec0` virtual table keyed by id, with the embedding model recorded per row. pgvector
 * implements the same {@link VectorStore} contract for cloud.
 */
export function createSqliteVecStore(options: SqliteVecStoreOptions): VectorStore {
  const { path, dimension, metric = 'l2', table = 'vectors' } = options;
  const sqlite = new Database(path);
  sqliteVec.load(sqlite);

  const metricClause = metric === 'cosine' ? ' distance_metric=cosine' : '';
  sqlite.exec(
    `CREATE VIRTUAL TABLE IF NOT EXISTS ${table} USING vec0(` +
      `id TEXT PRIMARY KEY, embedding float[${dimension}]${metricClause}, model TEXT)`,
  );

  const insertStmt = sqlite.prepare(`INSERT INTO ${table}(id, embedding, model) VALUES (?, ?, ?)`);
  const deleteStmt = sqlite.prepare(`DELETE FROM ${table} WHERE id = ?`);
  const queryStmt = sqlite.prepare(
    `SELECT id, distance, model FROM ${table} WHERE embedding MATCH ? ORDER BY distance LIMIT ?`,
  );

  let open = true;
  const capabilities: VectorStoreCapabilities = { metric, dimension };

  const toBlob = (vector: readonly number[]): Buffer => {
    if (vector.length !== dimension) {
      throw new ValidationError('vector length does not match store dimension', {
        details: { expected: dimension, got: vector.length },
      });
    }
    return Buffer.from(new Float32Array(vector).buffer);
  };

  return {
    capabilities,

    async upsert(items) {
      const run = sqlite.transaction((rows: readonly VectorItem[]) => {
        for (const item of rows) {
          deleteStmt.run(item.id); // replace-by-id (vec0 has no upsert)
          insertStmt.run(item.id, toBlob(item.vector), item.model);
        }
      });
      run(items);
    },

    async query(vector, k) {
      const rows = queryStmt.all(toBlob(vector), k) as MatchRow[];
      return rows.map((row): VectorMatch => ({
        id: row.id,
        distance: row.distance,
        model: row.model,
      }));
    },

    async delete(ids) {
      const run = sqlite.transaction((list: readonly string[]) => {
        for (const id of list) deleteStmt.run(id);
      });
      run(ids);
    },

    async close() {
      if (open) {
        sqlite.close();
        open = false;
      }
    },
  };
}
