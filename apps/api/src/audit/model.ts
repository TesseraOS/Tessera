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
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

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

export const DEFAULT_AUDIT_PAGE_SIZE = 50;
export const MAX_AUDIT_PAGE_SIZE = 200;

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
