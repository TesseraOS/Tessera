import type { ProjectId, TenantId } from '@tessera/core';

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
 * **Scope (FR-52/FR-66, ADR-0033/0037):** the store the factory returns operates within
 * `(DEFAULT_TENANT_ID, DEFAULT_PROJECT_ID)`. {@link VectorStore.forTenant} then
 * {@link VectorStore.forProject} return views whose reads/writes are confined to one
 * `(tenant, project)` scope, so vectors written under one scope are never returned to another.
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
   * A view of this store confined to `tenantId` (FR-52), reset to that tenant's
   * {@link DEFAULT_PROJECT_ID}. The default view is {@link DEFAULT_TENANT_ID}; the returned view
   * shares the underlying connection/resources.
   */
  forTenant(tenantId: TenantId): VectorStore;
  /**
   * A view of this store confined to `projectId` **within the current tenant** (FR-66, ADR-0037).
   * The default view is {@link DEFAULT_PROJECT_ID}; chain after {@link VectorStore.forTenant} for a
   * full `(tenant, project)` scope. Vectors written under one project are never returned to another.
   */
  forProject(projectId: ProjectId): VectorStore;
}
