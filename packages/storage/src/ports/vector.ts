import type { TenantId } from '@tessera/core';

/** Distance metric used by a vector index. */
export type VectorMetric = 'l2' | 'cosine';

/** Capability flags a VectorStore advertises. */
export interface VectorStoreCapabilities {
  readonly metric: VectorMetric;
  /** Fixed embedding dimension this store accepts. */
  readonly dimension: number;
}

/** A vector to store. `model` records the embedding model that produced it (ADR-0006). */
export interface VectorItem {
  readonly id: string;
  /** Embedding values; length must equal the store's dimension. */
  readonly vector: readonly number[];
  /** Embedding model id (lets us re-embed/migrate without corrupting the index). */
  readonly model: string;
}

/** A nearest-neighbor match. */
export interface VectorMatch {
  readonly id: string;
  /** Distance under the store's metric (smaller = closer). */
  readonly distance: number;
  readonly model: string;
}

/**
 * Vector store port for semantic retrieval (ADR-0004/0006). Local default is sqlite-vec; a
 * pgvector adapter implements the same contract for cloud (ADR-0003). Each vector records its
 * embedding `model`; the `dimension` is fixed per store.
 *
 * **Tenancy (FR-52, ADR-0033):** the store the factory returns operates within
 * {@link DEFAULT_TENANT_ID}. {@link VectorStore.forTenant} returns a view whose reads/writes are
 * confined to one tenant, so vectors written under one tenant are never returned to another.
 */
export interface VectorStore {
  readonly capabilities: VectorStoreCapabilities;
  /** Insert or replace vectors by id. */
  upsert(items: readonly VectorItem[]): Promise<void>;
  /** Return the `k` nearest vectors to `vector`, ordered by ascending distance. */
  query(vector: readonly number[], k: number): Promise<readonly VectorMatch[]>;
  /** Remove vectors by id (no error if absent). */
  delete(ids: readonly string[]): Promise<void>;
  /** Release resources. */
  close(): Promise<void>;
  /**
   * A view of this store confined to `tenantId` (FR-52). The default view is
   * {@link DEFAULT_TENANT_ID}; the returned view shares the underlying connection/resources.
   */
  forTenant(tenantId: TenantId): VectorStore;
}
