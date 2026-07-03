import pg from 'pg';
import { DEFAULT_TENANT_ID, ValidationError, type TenantId } from '@tessera/core';
import type {
  VectorMatch,
  VectorMetric,
  VectorStore,
  VectorStoreCapabilities,
} from '../../ports/vector.js';

export interface PgVectorStoreOptions {
  /** Postgres connection string (a pgvector-enabled server, e.g. the Docker Compose `postgres` service). */
  readonly connectionString: string;
  /** Fixed embedding dimension. */
  readonly dimension: number;
  /** Distance metric (default 'l2'). */
  readonly metric?: VectorMetric;
  /** Table name (default 'vectors'); must be a plain identifier. */
  readonly table?: string;
}

/** pgvector distance operator per metric: `<->` = L2, `<=>` = cosine distance. */
const DISTANCE_OPERATOR: Record<VectorMetric, string> = { l2: '<->', cosine: '<=>' };

/** Render a vector as a pgvector text literal `[a,b,c]` for a `$n::vector` cast. */
function toVectorLiteral(vector: readonly number[]): string {
  return `[${vector.join(',')}]`;
}

interface MatchRow {
  readonly id: string;
  readonly distance: number | string;
  readonly model: string;
}

/**
 * Cloud/self-hosted VectorStore backed by Postgres + the **pgvector** extension (ADR-0006/0026),
 * implementing the same {@link VectorStore} contract as the local sqlite-vec adapter (so it passes the
 * shared conformance suite). Vectors live in a `vector(N)` column keyed by id, with the embedding model
 * recorded per row; nearest-neighbor search uses the metric's distance operator. The extension + table
 * are created lazily on first use. Vectors are parameterized as `$n::vector` literals — no extra
 * `pgvector` npm dependency (only `pg` is added).
 *
 * **Tenancy (FR-52, ADR-0033):** a `tenant` column (part of the composite primary key `(tenant, id)`)
 * scopes every row. The base store operates in {@link DEFAULT_TENANT_ID}; {@link VectorStore.forTenant}
 * returns a view bound to another tenant over the same pool/table, filtering every read + write by it —
 * so the same id can exist independently per tenant and a query never crosses tenants.
 */
export function createPgVectorStore(options: PgVectorStoreOptions): VectorStore {
  const { connectionString, dimension, metric = 'l2', table = 'vectors' } = options;
  // The table name is interpolated into SQL (identifiers can't be parameterized), so constrain it.
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) {
    throw new ValidationError('invalid vector table name', { details: { table } });
  }
  const operator = DISTANCE_OPERATOR[metric];
  const capabilities: VectorStoreCapabilities = { metric, dimension };
  const pool = new pg.Pool({ connectionString });
  let open = true;
  let ready: Promise<void> | undefined;

  /** Create the extension + table once (idempotent). */
  function ensureReady(): Promise<void> {
    ready ??= (async () => {
      await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
      await pool.query(
        `CREATE TABLE IF NOT EXISTS ${table} ` +
          `(tenant text NOT NULL DEFAULT '${DEFAULT_TENANT_ID}', id text NOT NULL, ` +
          `embedding vector(${dimension}), model text NOT NULL, PRIMARY KEY (tenant, id))`,
      );
    })();
    return ready;
  }

  function assertDimension(vector: readonly number[]): void {
    if (vector.length !== dimension) {
      throw new ValidationError('vector length does not match store dimension', {
        details: { expected: dimension, got: vector.length },
      });
    }
  }

  function storeFor(tenantId: TenantId): VectorStore {
    return {
      capabilities,

      async upsert(items) {
        await ensureReady();
        for (const item of items) assertDimension(item.vector);
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          for (const item of items) {
            await client.query(
              `INSERT INTO ${table} (tenant, id, embedding, model) VALUES ($1, $2, $3::vector, $4) ` +
                `ON CONFLICT (tenant, id) DO UPDATE SET embedding = EXCLUDED.embedding, model = EXCLUDED.model`,
              [tenantId, item.id, toVectorLiteral(item.vector), item.model],
            );
          }
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      },

      async query(vector, k) {
        await ensureReady();
        assertDimension(vector);
        const result = await pool.query(
          `SELECT id, embedding ${operator} $1::vector AS distance, model ` +
            `FROM ${table} WHERE tenant = $2 ORDER BY distance LIMIT $3`,
          [toVectorLiteral(vector), tenantId, k],
        );
        return (result.rows as MatchRow[]).map((row): VectorMatch => ({
          id: row.id,
          distance: Number(row.distance),
          model: row.model,
        }));
      },

      async delete(ids) {
        if (ids.length === 0) return;
        await ensureReady();
        await pool.query(`DELETE FROM ${table} WHERE tenant = $1 AND id = ANY($2)`, [
          tenantId,
          ids,
        ]);
      },

      async close() {
        // The pool is shared across tenant views; close it once (guarded).
        if (open) {
          open = false;
          await pool.end();
        }
      },

      forTenant(next) {
        return storeFor(next);
      },
    };
  }

  return storeFor(DEFAULT_TENANT_ID);
}
