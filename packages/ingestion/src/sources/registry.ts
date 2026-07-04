import { DEFAULT_TENANT_ID, newId, type TenantId } from '@tessera/core';
import type { SourceId } from '../domain.js';

/**
 * Connector-specific, JSON-safe configuration for a source (e.g. `{ root }` for filesystem/git). Kept
 * opaque here — the composition root's connector factory interprets it, so new connector kinds add
 * config keys without changing this contract.
 */
export type SourceConfig = Readonly<Record<string, unknown>>;

/**
 * A persisted, configured ingestion source (one connector instance the runtime can scan). Tenant-scoped
 * (ADR-0033): a source belongs to exactly one tenant and is only visible/removable within it.
 */
export interface SourceRecord {
  readonly id: SourceId;
  /** Connector kind, e.g. `'filesystem'` or `'git'`. */
  readonly kind: string;
  /** Human-readable label (defaults to the config root or the kind). */
  readonly label: string;
  readonly config: SourceConfig;
  readonly tenantId: TenantId;
  /** ISO-8601 (UTC) registration time. */
  readonly createdAt: string;
}

/** Input to {@link SourceRegistry.register} — `id`/`tenantId`/`createdAt` are assigned by the registry. */
export interface RegisterSourceInput {
  readonly kind: string;
  readonly label?: string;
  readonly config: SourceConfig;
}

/**
 * The durable catalog of registered sources (FR-62). A relational adapter (F-038, `@tessera/config`)
 * persists them so sources survive restarts; ingestion ships the in-memory reference adapter used by
 * tests. Tenant-scoped via {@link SourceRegistry.forTenant} — the base view is {@link DEFAULT_TENANT_ID}.
 */
export interface SourceRegistry {
  list(): Promise<readonly SourceRecord[]>;
  register(input: RegisterSourceInput): Promise<SourceRecord>;
  get(id: SourceId): Promise<SourceRecord | undefined>;
  remove(id: SourceId): Promise<void>;
  /** A view scoped to `tenantId` — reads/writes never cross tenants (ADR-0033). */
  forTenant(tenantId: TenantId): SourceRegistry;
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
  const byTenant = new Map<TenantId, Map<SourceId, SourceRecord>>();

  function store(tenantId: TenantId): Map<SourceId, SourceRecord> {
    let records = byTenant.get(tenantId);
    if (records === undefined) {
      records = new Map();
      byTenant.set(tenantId, records);
    }
    return records;
  }

  function viewFor(tenantId: TenantId): SourceRegistry {
    const records = store(tenantId);
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
        return viewFor(next);
      },
    };
  }

  return viewFor(DEFAULT_TENANT_ID);
}
