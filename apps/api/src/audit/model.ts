/**
 * Audit trail domain model (FR-55, NFR-13; ADR-0034). Pure data — no I/O, no Fastify. An
 * {@link AuditEvent} is **append-only** and **non-sensitive**: it records *who did what, to what, with
 * what outcome, when* — never request bodies, secrets, or raw content (NFR-7). The HTTP layer records
 * events at the `/v1` boundary; `admin:manage` queries them; a retention policy prunes them.
 */
import { newId, type TenantId } from '@tessera/core';
import type { PrincipalKind } from '../auth/model.js';

/**
 * The sensitive actions the trail records (FR-55: access, writes, admin/config, billing). Stable
 * names so filtering + compliance reporting are deterministic; routes opt in by mapping to one.
 */
export const AUDIT_ACTIONS = [
  'search',
  'compile',
  'effects.read',
  'memory.read',
  'memory.write',
  'effects.write',
  'source.read',
  'source.manage',
  'billing.read',
  'billing.manage',
  'audit.read',
  'token.read',
  'token.manage',
  // Data governance (F-047): retention policy reads + prune runs, and data-subject-rights
  // export/erasure. All admin-only and always audited (NFR-13).
  'retention.read',
  'retention.manage',
  'dsr.export',
  'dsr.delete',
  // Taking the trail away is itself a sensitive action — FR-55 names "exports" in its own text, and
  // a compliance officer asking "who took a copy of the trail?" must be able to answer from the
  // trail. Distinct from `audit.read` (F-063): paging the view and exfiltrating the whole filtered
  // set are different facts, and one recorded as the other is indistinguishable from scrolling.
  'audit.export',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * The actions the Overview activity chart counts as "work" (F-084) — everything except the passive
 * `*.read` page-view actions. So `search`, `compile`, the `*.write`/`*.manage`/`*.export` mutations
 * and `dsr.delete` count; `memory.read`/`effects.read`/`source.read`/`audit.read`/`billing.read`/
 * `token.read`/`retention.read` do not. A mechanical, defensible rule — "activity, not page views".
 */
export const ACTIVITY_ACTIONS = AUDIT_ACTIONS.filter(
  (action) => !action.endsWith('.read'),
) as readonly AuditAction[];

/** Whether an audited action succeeded or was denied (authz/authn failure). */
export type AuditOutcome = 'success' | 'denied';

/** Who performed the action, taken from the request's resolved AuthContext. */
export interface AuditActor {
  readonly principalId: string;
  readonly kind: PrincipalKind;
}

/** Non-sensitive metadata scalars (no content/secrets). */
export type AuditMetadata = Readonly<Record<string, string | number | boolean>>;

/** One immutable, append-only audit record. */
export interface AuditEvent {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly actor: AuditActor;
  readonly action: AuditAction;
  /** Optional non-sensitive target ref (e.g. a lineage id or route pattern). */
  readonly target?: string;
  readonly outcome: AuditOutcome;
  /** ISO-8601 (UTC) time of the action. */
  readonly at: string;
  readonly metadata?: AuditMetadata;
}

/** Input to {@link import('./port.js').AuditLog.record} — `id`/`at` are assigned when absent. */
export interface AuditEventInput {
  readonly tenantId: TenantId;
  readonly actor: AuditActor;
  readonly action: AuditAction;
  readonly target?: string;
  readonly outcome: AuditOutcome;
  readonly at?: string;
  readonly metadata?: AuditMetadata;
}

/** Query filters over the trail. Results are newest-first; `cursor` paginates forward. */
export interface AuditQuery {
  readonly action?: AuditAction;
  readonly actor?: string;
  readonly outcome?: AuditOutcome;
  /** Inclusive lower time bound (ISO). */
  readonly since?: string;
  /** Inclusive upper time bound (ISO). */
  readonly until?: string;
  readonly limit?: number;
  /** Opaque cursor from a prior page's `nextCursor`. */
  readonly cursor?: string;
}

/** One page of audit events. `nextCursor` is present iff more match beyond this page. */
export interface AuditPage {
  readonly events: readonly AuditEvent[];
  readonly nextCursor?: string;
}

/** Retention policy (NFR-13): prune events older than `maxAgeMs` and/or beyond `maxEntries` (per tenant). */
export interface RetentionPolicy {
  readonly maxAgeMs?: number;
  readonly maxEntries?: number;
}

/**
 * Query for {@link import('./port.js').AuditLog.activity} — daily activity aggregation (F-084).
 * The window is inclusive on both ends. `actions` restricts which actions count; omitted ⇒
 * {@link ACTIVITY_ACTIONS}.
 */
export interface ActivityQuery {
  /** Inclusive lower bound (ISO). */
  readonly since: string;
  /** Inclusive upper bound (ISO). */
  readonly until: string;
  /** Actions to count; defaults to {@link ACTIVITY_ACTIONS}. */
  readonly actions?: readonly AuditAction[];
  /**
   * The viewer's UTC offset in minutes **east** of UTC (JS: `-getTimezoneOffset()`), applied when
   * bucketing an instant into a calendar day (F-088): a day boundary is a viewer-relative concept,
   * so the offset must reach the aggregation — the store — rather than re-bucketing pages of the
   * trail in memory. Default `0` = UTC days (exact F-084 behavior). A **fixed** offset for the whole
   * window: across a DST transition inside it, boundary hours can land one day off — documented at
   * the API parameter, deliberate (SQLite has no tz database to do better honestly).
   */
  readonly tzOffsetMinutes?: number;
}

/** One calendar day's activity count, in the query's `tzOffsetMinutes` frame (UTC when 0). */
export interface ActivityBucket {
  /** The calendar day, `YYYY-MM-DD`, in the query's offset frame. */
  readonly date: string;
  readonly count: number;
}

/**
 * Result of {@link import('./port.js').AuditLog.activity}. `buckets` holds only days that had ≥1
 * matching event; the caller zero-fills the calendar. `earliest` is the oldest event in the tenant's
 * **whole** trail (any action), or `null` if the trail is empty.
 *
 * `earliest` is the load-bearing field (ADR-0053 clause 3): it is the retention floor — how far back
 * the trail can prove anything — so a chart never draws a zero for a day whose records were pruned.
 * It is the min over *all* actions, not the filtered set, because pruning (`maxAgeMs`/`maxEntries`)
 * does not discriminate by action, so the floor does not either.
 */
export interface ActivityResult {
  readonly buckets: readonly ActivityBucket[];
  readonly earliest: string | null;
}

export const DEFAULT_AUDIT_PAGE_SIZE = 50;
export const MAX_AUDIT_PAGE_SIZE = 200;

/**
 * Hard bound on how many events one export materializes (F-063).
 *
 * The DSR bundle's trail walk is unbounded, which is defensible there: a right-of-access request is a
 * rare, deliberate act. An export **button** on an admin screen is neither, so an unbounded walk is a
 * latent OOM one click away. A truncated export that **says** it is truncated is honest; a silent one
 * is the trap this feature exists to remove — so the response carries a `truncated` flag and the UI
 * states it.
 */
export const MAX_AUDIT_EXPORT_ROWS = 50_000;

/** True if `value` is a known {@link AuditAction}. */
export function isAuditAction(value: unknown): value is AuditAction {
  return typeof value === 'string' && (AUDIT_ACTIONS as readonly string[]).includes(value);
}

/** Complete an {@link AuditEventInput} into an {@link AuditEvent}, assigning `id` + `at` when absent. */
export function toAuditEvent(input: AuditEventInput): AuditEvent {
  return {
    id: newId<'Audit'>(),
    tenantId: input.tenantId,
    actor: input.actor,
    action: input.action,
    ...(input.target !== undefined ? { target: input.target } : {}),
    outcome: input.outcome,
    at: input.at ?? new Date().toISOString(),
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
  };
}
