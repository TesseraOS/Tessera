import type { TenantId } from '@tessera/core';
import type { AuditLog } from '../audit/index.js';
import { RECENT_ACTIVITY_ACTIONS } from '../audit/model.js';
import type { AuditActor } from '../audit/model.js';

/**
 * The Overview "Recent activity" feed + notifications bell data (F-089) — Fastify-free, mirroring
 * {@link import('./core.js').computeWorkspaceStats} / {@link import('./activity.js').computeWorkspaceActivity}.
 *
 * The feed used to be an in-memory, live-session store (F-060) that a reload emptied — the reported
 * defect. The **audit trail is the persisted record of workspace activity**, so this reads it,
 * narrowed three ways relative to the admin `/v1/audit` surface it must never become:
 *
 * - **success only** — denied attempts are a security signal for admins, not feed content;
 * - **work actions minus `search`** ({@link RECENT_ACTIVITY_ACTIONS}) — the rule is stated on the
 *   constant;
 * - **non-sensitive fields only** — no outcome (constant by construction), no metadata; `target` is
 *   an id or route pattern by the recorder's own guarantee (NFR-7).
 */

export interface RecentActivityEvent {
  /** The audit event's stable id — what per-message read state keys on. */
  readonly id: string;
  readonly action: string;
  /** A non-sensitive target: an id or a route pattern — never content. */
  readonly target?: string;
  readonly actor: AuditActor;
  /** ISO-8601 (UTC) time of the action. */
  readonly at: string;
}

export interface RecentActivity {
  /** Newest first, at most the requested limit. */
  readonly events: readonly RecentActivityEvent[];
}

export const DEFAULT_RECENT_LIMIT = 20;
export const MAX_RECENT_LIMIT = 50;

/** The last N successful work actions for one tenant, newest first (F-089). */
export async function computeRecentActivity(
  audit: AuditLog,
  tenantId: TenantId,
  options: { limit?: number } = {},
): Promise<RecentActivity> {
  const limit = Math.min(Math.max(1, options.limit ?? DEFAULT_RECENT_LIMIT), MAX_RECENT_LIMIT);
  const { events } = await audit.forTenant(tenantId).query({
    actions: RECENT_ACTIVITY_ACTIONS,
    outcome: 'success',
    limit,
  });
  return {
    events: events.map((event) => ({
      id: event.id,
      action: event.action,
      ...(event.target !== undefined ? { target: event.target } : {}),
      actor: event.actor,
      at: event.at,
    })),
  };
}
