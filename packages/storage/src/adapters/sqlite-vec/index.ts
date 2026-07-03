import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { createHash } from 'node:crypto';
import { DEFAULT_TENANT_ID, ValidationError, type TenantId } from '@tessera/core';
import type {
  VectorItem,
  VectorMatch,
  VectorMetric,
  VectorStore,
  VectorStoreCapabilities,
} from '../../ports/vector.js';
import fs from 'node:fs';
import path from 'node:path';

export interface SqliteVecStoreOptions {
  /** File path, or ':memory:' for an ephemeral index. */
  readonly path: string;
  /** Fixed embedding dimension. */
  readonly dimension: number;
  /** Distance metric (default 'l2'). */
  readonly metric?: VectorMetric;
  /** Virtual table name for the default tenant (default 'vectors'). */
  readonly table?: string;
}

interface MatchRow {
  id: string;
  distance: number;
  model: string;
}

/** Prepared statements bound to one tenant's `vec0` table. */
interface TableStmts {
  insert: Database.Statement;
  remove: Database.Statement;
  query: Database.Statement;
}

/**
 * Local VectorStore backed by SQLite + the sqlite-vec extension (ADR-0006). Stores vectors in a
 * `vec0` virtual table keyed by id, with the embedding model recorded per row. pgvector
 * implements the same {@link VectorStore} contract for cloud.
 *
 * **Tenancy (FR-52, ADR-0033):** each tenant gets its **own** `vec0` table (the default tenant uses
 * the base `table`; others a deterministic `${table}__t_<hash>`), so a KNN query naturally sees only
 * the caller-tenant's vectors and the same id can exist independently per tenant. All tables share
 * one connection; only closing the default view (the runtime's store) releases it.
 */
export function createSqliteVecStore(options: SqliteVecStoreOptions): VectorStore {
  const { path: dbPath, dimension, metric = 'l2', table = 'vectors' } = options;
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const sqlite = new Database(dbPath);
  sqliteVec.load(sqlite);

  const metricClause = metric === 'cosine' ? ' distance_metric=cosine' : '';
  const capabilities: VectorStoreCapabilities = { metric, dimension };
  const tables = new Map<string, TableStmts>();
  let open = true;

  const toBlob = (vector: readonly number[]): Buffer => {
    if (vector.length !== dimension) {
      throw new ValidationError('vector length does not match store dimension', {
        details: { expected: dimension, got: vector.length },
      });
    }
    return Buffer.from(new Float32Array(vector).buffer);
  };

  /** Derive a safe, deterministic table name for a tenant (base table for the default tenant). */
  function tableFor(tenantId: TenantId): string {
    if (tenantId === DEFAULT_TENANT_ID) return table;
    // Hash the opaque tenant id into a fixed, identifier-safe suffix.
    const hash = createHash('sha256').update(tenantId).digest('hex').slice(0, 16);
    return `${table}__t_${hash}`;
  }

  /** Create a tenant's `vec0` table + prepared statements once, then reuse them. */
  function stmtsFor(tableName: string): TableStmts {
    let stmts = tables.get(tableName);
    if (stmts === undefined) {
      sqlite.exec(
        `CREATE VIRTUAL TABLE IF NOT EXISTS ${tableName} USING vec0(` +
          `id TEXT PRIMARY KEY, embedding float[${dimension}]${metricClause}, model TEXT)`,
      );
      stmts = {
        insert: sqlite.prepare(`INSERT INTO ${tableName}(id, embedding, model) VALUES (?, ?, ?)`),
        remove: sqlite.prepare(`DELETE FROM ${tableName} WHERE id = ?`),
        query: sqlite.prepare(
          `SELECT id, distance, model FROM ${tableName} WHERE embedding MATCH ? ORDER BY distance LIMIT ?`,
        ),
      };
      tables.set(tableName, stmts);
    }
    return stmts;
  }

  function storeFor(tenantId: TenantId): VectorStore {
    const tableName = tableFor(tenantId);
    return {
      capabilities,

      async upsert(items) {
        const { insert, remove } = stmtsFor(tableName);
        const run = sqlite.transaction((rows: readonly VectorItem[]) => {
          for (const item of rows) {
            remove.run(item.id); // replace-by-id (vec0 has no upsert)
            insert.run(item.id, toBlob(item.vector), item.model);
          }
        });
        run(items);
      },

      async query(vector, k) {
        const rows = stmtsFor(tableName).query.all(toBlob(vector), k) as MatchRow[];
        return rows.map((row): VectorMatch => ({
          id: row.id,
          distance: row.distance,
          model: row.model,
        }));
      },

      async delete(ids) {
        const { remove } = stmtsFor(tableName);
        const run = sqlite.transaction((list: readonly string[]) => {
          for (const id of list) remove.run(id);
        });
        run(ids);
      },

      async close() {
        // Only the default view owns the connection lifecycle; tenant views share it.
        if (tenantId === DEFAULT_TENANT_ID && open) {
          sqlite.close();
          open = false;
        }
      },

      forTenant(next) {
        return storeFor(next);
      },
    };
  }

  // Create the default-tenant table eagerly so the base store's table exists on construction.
  stmtsFor(tableFor(DEFAULT_TENANT_ID));
  return storeFor(DEFAULT_TENANT_ID);
}
