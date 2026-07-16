import { DEFAULT_TENANT_ID, type TenantId } from '@tessera/core';
import type { Memory, MemoryId, MemoryLineageId } from '../domain.js';
import type { MemoryListFilter, MemoryStore } from '../ports/memory-store.js';

function byCreatedThenId(a: Memory, b: Memory): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * In-memory {@link MemoryStore} — the reference adapter that drives the conformance suite and backs
 * fast unit tests. Versions are immutable; superseding replaces only the previous version's
 * `supersededBy` back-pointer (content is never changed).
 *
 * **Tenancy (FR-52, ADR-0033):** rows are partitioned into a per-tenant map; a store view reads/writes
 * only its bound tenant's partition (base view = {@link DEFAULT_TENANT_ID}). The partitions are shared
 * across views so `forTenant` is a cheap, consistent scoping of the same underlying data.
 */
export function createInMemoryMemoryStore(): MemoryStore {
  const byTenant = new Map<TenantId, Map<MemoryId, Memory>>();

  function partition(tenantId: TenantId): Map<MemoryId, Memory> {
    let map = byTenant.get(tenantId);
    if (map === undefined) {
      map = new Map<MemoryId, Memory>();
      byTenant.set(tenantId, map);
    }
    return map;
  }

  function storeFor(tenantId: TenantId): MemoryStore {
    const byId = partition(tenantId);
    return {
      add(memory) {
        byId.set(memory.id, memory);
        return Promise.resolve();
      },

      supersede(previousId, next) {
        const previous = byId.get(previousId);
        if (previous !== undefined) {
          byId.set(previousId, { ...previous, supersededBy: next.id });
        }
        byId.set(next.id, next);
        return Promise.resolve();
      },

      getById(id) {
        return Promise.resolve(byId.get(id));
      },

      getCurrent(lineageId: MemoryLineageId) {
        for (const memory of byId.values()) {
          if (memory.lineageId === lineageId && memory.supersededBy === null) {
            return Promise.resolve(memory);
          }
        }
        return Promise.resolve(undefined);
      },

      listVersions(lineageId: MemoryLineageId) {
        const versions = [...byId.values()]
          .filter((memory) => memory.lineageId === lineageId)
          .sort((a, b) => a.version - b.version);
        return Promise.resolve(versions);
      },

      listCurrent(filter?: MemoryListFilter) {
        const current = [...byId.values()]
          .filter(
            (memory) =>
              memory.supersededBy === null &&
              (filter?.kind === undefined || memory.kind === filter.kind) &&
              (filter?.scope === undefined || memory.scope === filter.scope),
          )
          .sort(byCreatedThenId);
        return Promise.resolve(current);
      },

      exportAll() {
        return Promise.resolve([...byId.values()].sort(byCreatedThenId));
      },

      deleteVersion(id) {
        byId.delete(id);
        return Promise.resolve();
      },

      deleteLineage(lineageId) {
        for (const [id, memory] of byId) {
          if (memory.lineageId === lineageId) byId.delete(id);
        }
        return Promise.resolve();
      },

      forTenant(next) {
        return storeFor(next);
      },
    };
  }

  return storeFor(DEFAULT_TENANT_ID);
}
