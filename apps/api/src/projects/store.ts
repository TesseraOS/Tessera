/**
 * Persistence port for {@link Project}s (FR-66, ADR-0037). Holds only the **stored** (non-default)
 * projects; the reserved default project is synthesized by {@link import('./service.js').ProjectService}
 * and is never persisted. Adapters: in-memory (reference/Local default) + SQLite (`@tessera/config`),
 * mirroring the memory/graph/token store seam. Every method is tenant-scoped by an explicit `tenantId`
 * argument (like the {@link import('../auth/token-store.js').TokenStore}), so a project id is only ever
 * visible/mutable within the tenant that owns it.
 */
import type { ProjectId, TenantId } from '@tessera/core';
import type { Project } from './model.js';

export interface ProjectStore {
  /** Persist a new (non-default) project. The caller assigns `id`/`createdAt`. */
  create(project: Project): Promise<void>;
  /** Fetch one project by id within a tenant, or `undefined`. */
  get(tenantId: TenantId, id: ProjectId): Promise<Project | undefined>;
  /** Every stored project for a tenant, oldest first (the default project is not included). */
  list(tenantId: TenantId): Promise<readonly Project[]>;
  /** Rename a project; returns the updated record, or `undefined` if it does not exist. */
  rename(tenantId: TenantId, id: ProjectId, name: string): Promise<Project | undefined>;
  /** Delete a project by id (idempotent — no error if absent). */
  remove(tenantId: TenantId, id: ProjectId): Promise<void>;
}

/** Stable listing order: oldest first, breaking ties by id. */
function byCreatedAtThenId(a: Project, b: Project): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * In-memory {@link ProjectStore} — the reference adapter (drives the conformance suite) and the Local
 * default. Records are partitioned per tenant, so a project is never visible across tenants. Not durable
 * across restarts — the SQLite adapter in `@tessera/config` is the persistent seam.
 */
export function createInMemoryProjectStore(): ProjectStore {
  const byTenant = new Map<TenantId, Map<ProjectId, Project>>();

  function partition(tenantId: TenantId): Map<ProjectId, Project> {
    let records = byTenant.get(tenantId);
    if (records === undefined) {
      records = new Map();
      byTenant.set(tenantId, records);
    }
    return records;
  }

  return {
    create(project) {
      partition(project.tenantId).set(project.id, project);
      return Promise.resolve();
    },
    get(tenantId, id) {
      return Promise.resolve(partition(tenantId).get(id));
    },
    list(tenantId) {
      return Promise.resolve([...partition(tenantId).values()].sort(byCreatedAtThenId));
    },
    rename(tenantId, id, name) {
      const records = partition(tenantId);
      const existing = records.get(id);
      if (existing === undefined) return Promise.resolve(undefined);
      const updated: Project = { ...existing, name };
      records.set(id, updated);
      return Promise.resolve(updated);
    },
    remove(tenantId, id) {
      partition(tenantId).delete(id);
      return Promise.resolve();
    },
  };
}
