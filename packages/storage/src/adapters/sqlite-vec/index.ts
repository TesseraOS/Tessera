import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { createHash } from 'node:crypto';
import {
  DEFAULT_PROJECT_ID,
  DEFAULT_TENANT_ID,
  ValidationError,
  type ProjectId,
  type TenantId,
} from '@tessera/core';
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
 * **Scope (FR-52/FR-66, ADR-0033/0037):** each `(tenant, project)` gets its **own** `vec0` table (the
 * base `(default, default)` uses the base `table`; others a deterministic `${table}__t_<hash>[__p_<hash>]`),
 * so a KNN query naturally sees only that scope's vectors and the same id can exist independently per
 * scope. The `(tenant, default-project)` suffix is byte-for-byte the pre-project `${table}__t_<hash>`, so
 * existing tenant tables are preserved. All tables share one connection; only closing the base view (the
 * runtime's store) releases it.
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

  /** Hash an opaque id into a fixed, identifier-safe suffix. */
  function hash(value: string): string {
    return createHash('sha256').update(value).digest('hex').slice(0, 16);
  }

  /**
   * Derive a safe, deterministic table name for a `(tenant, project)` scope (base table for the fully
   * default scope). The `(tenant, default-project)` name is exactly the pre-project `${table}__t_<hash>`,
   * so a tenant's existing vectors keep resolving after projects are introduced.
   */
  function tableFor(tenantId: TenantId, projectId: ProjectId): string {
    const parts: string[] = [];
    if (tenantId !== DEFAULT_TENANT_ID) parts.push(`t_${hash(tenantId)}`);
    if (projectId !== DEFAULT_PROJECT_ID) parts.push(`p_${hash(projectId)}`);
    return parts.length === 0 ? table : `${table}__${parts.join('__')}`;
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

  function storeFor(tenantId: TenantId, projectId: ProjectId): VectorStore {
    const tableName = tableFor(tenantId, projectId);
    const isBase = tenantId === DEFAULT_TENANT_ID && projectId === DEFAULT_PROJECT_ID;
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
        // Only the base view owns the connection lifecycle; scoped views share it.
        if (isBase && open) {
          sqlite.close();
          open = false;
        }
      },

      forTenant(next) {
        return storeFor(next, DEFAULT_PROJECT_ID);
      },

      forProject(next) {
        return storeFor(tenantId, next);
      },
    };
  }

  // Create the base-scope table eagerly so the base store's table exists on construction.
  stmtsFor(tableFor(DEFAULT_TENANT_ID, DEFAULT_PROJECT_ID));
  return storeFor(DEFAULT_TENANT_ID, DEFAULT_PROJECT_ID);
}
