import {
  DEFAULT_PROJECT_ID,
  DEFAULT_TENANT_ID,
  type ProjectId,
  type TenantId,
} from '@tessera/core';
import type { Memory, MemoryId, MemoryLineageId } from '../domain.js';
import type { MemoryListFilter, MemoryStore } from '../ports/memory-store.js';

function byCreatedThenId(a: Memory, b: Memory): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** A collision-free key for a `(tenant, project)` partition (null byte can't appear in either id). */
function scopeKey(tenantId: TenantId, projectId: ProjectId): string {
  return `${tenantId}\u0000${projectId}`;
}

/**
 * In-memory {@link MemoryStore} — the reference adapter that drives the conformance suite and backs
 * fast unit tests. Versions are immutable; superseding replaces only the previous version's
 * `supersededBy` back-pointer (content is never changed).
 *
 * **Scope (FR-52/FR-66, ADR-0033/0037):** rows are partitioned into a per-`(tenant, project)` map; a
 * store view reads/writes only its bound scope's partition (base view =
 * `(DEFAULT_TENANT_ID, DEFAULT_PROJECT_ID)`). The partitions are shared across views so
 * `forTenant`/`forProject` are cheap, consistent scopings of the same underlying data.
 */
export function createInMemoryMemoryStore(): MemoryStore {
  const byScope = new Map<string, Map<MemoryId, Memory>>();

  function partition(tenantId: TenantId, projectId: ProjectId): Map<MemoryId, Memory> {
    const key = scopeKey(tenantId, projectId);
    let map = byScope.get(key);
    if (map === undefined) {
      map = new Map<MemoryId, Memory>();
      byScope.set(key, map);
    }
    return map;
  }

  function storeFor(tenantId: TenantId, projectId: ProjectId): MemoryStore {
    const byId = partition(tenantId, projectId);
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

      countCurrent(filter?: MemoryListFilter) {
        let total = 0;
        for (const memory of byId.values()) {
          if (
            memory.supersededBy === null &&
            (filter?.kind === undefined || memory.kind === filter.kind) &&
            (filter?.scope === undefined || memory.scope === filter.scope)
          ) {
            total += 1;
          }
        }
        return Promise.resolve(total);
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
        return storeFor(next, DEFAULT_PROJECT_ID);
      },

      forProject(next) {
        return storeFor(tenantId, next);
      },
    };
  }

  return storeFor(DEFAULT_TENANT_ID, DEFAULT_PROJECT_ID);
}
