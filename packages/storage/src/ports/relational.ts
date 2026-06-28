/**
 * Relational store port — engine-agnostic lifecycle. The query layer is Drizzle (ADR-0005);
 * concrete adapters (SQLite now, Postgres later) additionally expose a typed `db` handle.
 * Kept minimal here and extended by the SQLite adapter (F-003 increment 4).
 */
export interface RelationalStore {
  /** Apply pending migrations. */
  migrate(): Promise<void>;
  /** Connectivity/liveness check. */
  healthcheck(): Promise<boolean>;
  /** Release resources / close connections. */
  close(): Promise<void>;
}
