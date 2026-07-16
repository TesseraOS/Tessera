import type { TenantId } from '@tessera/core';
import type { Memory, MemoryId, MemoryKind, MemoryLineageId } from '../domain.js';

/** Filter for listing the current memories. */
export interface MemoryListFilter {
  readonly kind?: MemoryKind;
  readonly scope?: string;
}

/**
 * Persistence port for versioned memories (ADR-0003). Adapters: in-memory (reference) and SQLite
 * (local default). Every adapter passes the shared conformance suite. The store is **append-only
 * for content**: a memory version is never edited in place — {@link MemoryStore.supersede} adds a
 * new version and links the previous one to it atomically (FR-12).
 */
export interface MemoryStore {
  /** Persist the first version of a new lineage. */
  add(memory: Memory): Promise<void>;
  /**
   * Atomically persist `next` and mark `previousId` as superseded by it. Implementations must apply
   * both effects together so a lineage never has two current versions.
   */
  supersede(previousId: MemoryId, next: Memory): Promise<void>;
  /** Fetch one version by its id. */
  getById(id: MemoryId): Promise<Memory | undefined>;
  /** The current (non-superseded) version of a lineage. */
  getCurrent(lineageId: MemoryLineageId): Promise<Memory | undefined>;
  /** All versions of a lineage, ordered by ascending version. */
  listVersions(lineageId: MemoryLineageId): Promise<readonly Memory[]>;
  /** The current version of every lineage, optionally filtered by kind/scope. */
  listCurrent(filter?: MemoryListFilter): Promise<readonly Memory[]>;
  /**
   * How many lineages have a current version matching `filter`, without materializing them. Counts
   * lineages, not versions — it mirrors {@link MemoryStore.listCurrent}, so superseded versions are
   * excluded. Backs the workspace summary (`GET /v1/stats`, F-060), requested on every dashboard
   * load; listing every memory to read `.length` would read the whole store in on the hot path.
   */
  countCurrent(filter?: MemoryListFilter): Promise<number>;
  /**
   * Every stored version across every lineage (ascending `createdAt`, then `id`) — the complete,
   * tenant-scoped memory record. Backs data-subject-rights export (NFR-13, F-047) and the retention
   * pass. Unlike {@link MemoryStore.listCurrent} it includes superseded versions.
   */
  exportAll(): Promise<readonly Memory[]>;
  /**
   * Delete a single version by id (idempotent — no error if absent). Used by the retention pass to
   * **compact already-superseded versions**; deleting the current version of a lineage is the caller's
   * responsibility to avoid (it would orphan the lineage) — expiry uses {@link MemoryStore.deleteLineage}.
   */
  deleteVersion(id: MemoryId): Promise<void>;
  /**
   * Delete every version of a lineage (idempotent). Used by retention **expiry** (FR-15) and DSR
   * **erasure** (NFR-13). This removes the memory outright — it is not a supersede, so the
   * never-silently-mutate contract (FR-12) is untouched.
   */
  deleteLineage(lineageId: MemoryLineageId): Promise<void>;
  /**
   * A view of this store confined to `tenantId` (FR-52, ADR-0033). The base store operates in
   * {@link DEFAULT_TENANT_ID}; memories written under one tenant are never visible to another.
   */
  forTenant(tenantId: TenantId): MemoryStore;
}
