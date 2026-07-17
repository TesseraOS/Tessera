import type { TenantId } from '@tessera/core';
import type {
  ActivityQuery,
  ActivityResult,
  AuditEventInput,
  AuditPage,
  AuditQuery,
  RetentionPolicy,
} from './model.js';

/**
 * Append-only audit trail (FR-55, NFR-13; ADR-0034). Records sensitive actions and answers admin
 * queries. **Tenant-scoped** via {@link AuditLog.forTenant} (ADR-0033): `record` stamps and `query`
 * filters the bound tenant, so one tenant never sees another's trail. Adapters: in-memory (reference)
 * and SQLite (persistent, wired in the composition root). Never stores sensitive content (NFR-7) — the
 * recorder passes only non-sensitive summaries.
 */
export interface AuditLog {
  /** Append one event within the bound tenant. Best-effort — callers isolate failures. */
  record(event: AuditEventInput): Promise<void>;
  /** Query the trail newest-first, filtered + paginated (bound tenant only). */
  query(query?: AuditQuery): Promise<AuditPage>;
  /**
   * Aggregate the bound tenant's trail into per-UTC-day counts of "work" actions (F-084), plus the
   * timestamp of the oldest event the trail holds. **Aggregated at the store** (a `GROUP BY`, not a
   * page walked into memory), and the `earliest` field is what lets a chart avoid drawing a pruned
   * day as silence (ADR-0053 clause 3). See {@link ActivityResult}.
   */
  activity(query: ActivityQuery): Promise<ActivityResult>;
  /** Apply a retention policy to the bound tenant, returning the number of events pruned. */
  prune(policy: RetentionPolicy): Promise<number>;
  /** A view of this trail confined to `tenantId`. The base log operates in the default tenant. */
  forTenant(tenantId: TenantId): AuditLog;
}
