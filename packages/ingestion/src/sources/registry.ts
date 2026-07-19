import {
  DEFAULT_PROJECT_ID,
  DEFAULT_TENANT_ID,
  newId,
  type ProjectId,
  type TenantId,
} from '@tessera/core';
import type { SourceId } from '../domain.js';

/**
 * Connector-specific, JSON-safe configuration for a source (e.g. `{ root }` for filesystem/git). Kept
 * opaque here — the composition root's connector factory interprets it, so new connector kinds add
 * config keys without changing this contract.
 */
export type SourceConfig = Readonly<Record<string, unknown>>;

/**
 * A persisted, configured ingestion source (one connector instance the runtime can scan). Scope-bound
 * (ADR-0033/0037): a source belongs to exactly one `(tenant, project)` and is only visible/removable
 * within it.
 */
export interface SourceRecord {
  readonly id: SourceId;
  /** Connector kind, e.g. `'filesystem'` or `'git'`. */
  readonly kind: string;
  /** Human-readable label (defaults to the config root or the kind). */
  readonly label: string;
  readonly config: SourceConfig;
  readonly tenantId: TenantId;
  /** Project the source belongs to, within the tenant (ADR-0037). */
  readonly projectId: ProjectId;
  /** ISO-8601 (UTC) registration time. */
  readonly createdAt: string;
}

/**
 * Input to {@link SourceRegistry.register} — `id`/`tenantId`/`projectId`/`createdAt` are assigned by the
 * registry (stamped from the bound scope, not the caller).
 */
export interface RegisterSourceInput {
  readonly kind: string;
  readonly label?: string;
  readonly config: SourceConfig;
}

/**
 * The durable catalog of registered sources (FR-62). A relational adapter (F-038, `@tessera/config`)
 * persists them so sources survive restarts; ingestion ships the in-memory reference adapter used by
 * tests. Scope-bound via {@link SourceRegistry.forTenant} then {@link SourceRegistry.forProject} — the
 * base view is `(DEFAULT_TENANT_ID, DEFAULT_PROJECT_ID)`.
 */
export interface SourceRegistry {
  list(): Promise<readonly SourceRecord[]>;
  register(input: RegisterSourceInput): Promise<SourceRecord>;
  get(id: SourceId): Promise<SourceRecord | undefined>;
  remove(id: SourceId): Promise<void>;
  /** A view scoped to `tenantId` (reset to its default project) — reads/writes never cross tenants (ADR-0033). */
  forTenant(tenantId: TenantId): SourceRegistry;
  /** A view scoped to `projectId` within the current tenant — reads/writes never cross projects (ADR-0037). */
  forProject(projectId: ProjectId): SourceRegistry;
}

/** Default label when the caller omits one: the config root if present, else the kind. */
export function defaultSourceLabel(input: RegisterSourceInput): string {
  const root = input.config['root'];
  return typeof root === 'string' && root.length > 0 ? root : input.kind;
}

/** Stable ordering for listings: oldest first, breaking ties by id. */
function byCreatedAtThenId(a: SourceRecord, b: SourceRecord): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * In-memory {@link SourceRegistry} — the reference adapter (drives the conformance suite) and the local
 * default for tests. A relational-backed adapter adds cross-process durability (F-038).
 */
export function createInMemorySourceRegistry(): SourceRegistry {
  const byScope = new Map<string, Map<SourceId, SourceRecord>>();

  const scopeKey = (tenantId: TenantId, projectId: ProjectId): string =>
    JSON.stringify([tenantId, projectId]);

  function store(tenantId: TenantId, projectId: ProjectId): Map<SourceId, SourceRecord> {
    const key = scopeKey(tenantId, projectId);
    let records = byScope.get(key);
    if (records === undefined) {
      records = new Map();
      byScope.set(key, records);
    }
    return records;
  }

  function viewFor(tenantId: TenantId, projectId: ProjectId): SourceRegistry {
    const records = store(tenantId, projectId);
    return {
      list() {
        return Promise.resolve([...records.values()].sort(byCreatedAtThenId));
      },
      register(input) {
        const record: SourceRecord = {
          id: newId<'Source'>(),
          kind: input.kind,
          label: input.label ?? defaultSourceLabel(input),
          config: { ...input.config },
          tenantId,
          projectId,
          createdAt: new Date().toISOString(),
        };
        records.set(record.id, record);
        return Promise.resolve(record);
      },
      get(id) {
        return Promise.resolve(records.get(id));
      },
      remove(id) {
        records.delete(id);
        return Promise.resolve();
      },
      forTenant(next) {
        return viewFor(next, DEFAULT_PROJECT_ID);
      },
      forProject(next) {
        return viewFor(tenantId, next);
      },
    };
  }

  return viewFor(DEFAULT_TENANT_ID, DEFAULT_PROJECT_ID);
}
