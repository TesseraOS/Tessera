/**
 * Projecting the audit trail into notifications (F-065; ADR-0064). Fastify-free, so `GET
 * /v1/notifications` and the `list_notifications` MCP tool call the identical function and cannot
 * drift into answering differently (ADR-0036 — one engine, two surfaces).
 */
import type { AuditAction, AuditEvent } from '../audit/model.js';
import type { AuditLog } from '../audit/port.js';
import {
  DEFAULT_NOTIFICATION_PAGE_SIZE,
  MAX_NOTIFICATION_PAGE_SIZE,
  NOTIFIABLE_ACTIONS,
  NOTIFICATION_UNREAD_WINDOW,
  SEVERITY_BY_KIND,
  isRead,
  kindForAction,
  kindsWithSeverity,
  type Notification,
  type NotificationKind,
  type NotificationPreferences,
  type NotificationReadState,
  type NotificationSeverity,
} from './model.js';

/** Filters over the projected notification list. Every field narrows; omitted ⇒ no narrowing. */
export interface NotificationQuery {
  /** Restrict to these kinds. Intersected with the caller's preferences. */
  readonly kinds?: readonly NotificationKind[];
  /** Restrict to one severity — pushed into the trail query as the kinds that carry it. */
  readonly severity?: NotificationSeverity;
  /** Only rows this principal has not read. Applied **after** the trail query — see below. */
  readonly unreadOnly?: boolean;
  readonly limit?: number;
  /** Opaque forward cursor from a prior page's `nextCursor`. */
  readonly cursor?: string;
}

/** One page of notifications, newest-first, plus the bounded unread count for the badge. */
export interface NotificationPage {
  readonly notifications: readonly Notification[];
  readonly nextCursor?: string;
  /**
   * Unread within the newest {@link NOTIFICATION_UNREAD_WINDOW} notifications — **not** over all
   * history. See the constant for why the bound is stated rather than hidden.
   */
  readonly unreadCount: number;
}

/** The context a projection needs beyond the trail: who is asking, and what they asked to hear. */
export interface NotificationContext {
  readonly readState: NotificationReadState;
  readonly preferences: NotificationPreferences;
}

/**
 * The audit actions to query for a given request: notifiable, enabled by preference, and matching
 * any explicit kind/severity filter. Empty ⇒ nothing can match, and the caller short-circuits
 * rather than issuing a query whose `IN ()` list is empty.
 */
function actionsFor(query: NotificationQuery, preferences: NotificationPreferences): AuditAction[] {
  const requested =
    query.severity !== undefined ? new Set(kindsWithSeverity(query.severity)) : undefined;
  const explicit = query.kinds !== undefined ? new Set(query.kinds) : undefined;

  return NOTIFIABLE_ACTIONS.filter((action) => {
    const kind = kindForAction(action);
    if (kind === undefined) return false;
    if (!preferences[kind]) return false;
    if (requested !== undefined && !requested.has(kind)) return false;
    if (explicit !== undefined && !explicit.has(kind)) return false;
    return true;
  });
}

/** Project one audit event. `undefined` for an action outside the taxonomy (defensive — filtered). */
function toNotification(
  event: AuditEvent,
  readState: NotificationReadState,
): Notification | undefined {
  const kind = kindForAction(event.action);
  if (kind === undefined) return undefined;
  return {
    id: event.id,
    kind,
    severity: SEVERITY_BY_KIND[kind],
    actor: event.actor,
    ...(event.target !== undefined ? { target: event.target } : {}),
    at: event.at,
    read: isRead(event, readState),
  };
}

/**
 * List a tenant's notifications for one principal.
 *
 * `auditLog` must already be tenant-scoped by the caller (`forTenant`) — the same discipline every
 * other trail reader follows, so tenancy is enforced once at the boundary rather than re-derived
 * here (ADR-0033).
 *
 * **Only successful events project.** A denied action is a security signal for the admin trail, not
 * something to tell the workspace about; the same narrowing `/v1/stats/activity/recent` makes.
 *
 * **`unreadOnly` filters after the query, not inside it**, because read state lives in a different
 * store and joining them at the database would couple the two — the thing keeping notifications a
 * *projection* is that the trail knows nothing about readers. The consequence is honest and
 * bounded: a page can come back shorter than `limit` while `nextCursor` still points at more. The
 * cursor remains exact, so paging never skips or repeats a row.
 */
export async function listNotifications(
  auditLog: AuditLog,
  context: NotificationContext,
  query: NotificationQuery = {},
): Promise<NotificationPage> {
  const limit = Math.min(query.limit ?? DEFAULT_NOTIFICATION_PAGE_SIZE, MAX_NOTIFICATION_PAGE_SIZE);
  const actions = actionsFor(query, context.preferences);
  const unreadCount = await unreadCountFor(auditLog, context);

  if (actions.length === 0) {
    return { notifications: [], unreadCount };
  }

  const page = await auditLog.query({
    actions,
    outcome: 'success',
    limit,
    ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
  });

  const projected = page.events
    .map((event) => toNotification(event, context.readState))
    .filter((notification): notification is Notification => notification !== undefined)
    .filter((notification) => query.unreadOnly !== true || !notification.read);

  return {
    notifications: projected,
    ...(page.nextCursor !== undefined ? { nextCursor: page.nextCursor } : {}),
    unreadCount,
  };
}

/**
 * Unread count for the badge, over the newest {@link NOTIFICATION_UNREAD_WINDOW} notifications the
 * principal's preferences admit. Preference-aware on purpose: a badge counting rows a person has
 * asked not to see is a badge that can never be cleared.
 */
export async function unreadCountFor(
  auditLog: AuditLog,
  context: NotificationContext,
): Promise<number> {
  const actions = actionsFor({}, context.preferences);
  if (actions.length === 0) return 0;

  const { events } = await auditLog.query({
    actions,
    outcome: 'success',
    limit: NOTIFICATION_UNREAD_WINDOW,
  });
  return events.reduce((count, event) => count + (isRead(event, context.readState) ? 0 : 1), 0);
}

/**
 * The newest notification instant available to this principal, or `null` when there is none — what
 * "mark all as read" watermarks to. Read from the store rather than taken from the client, so a
 * client cannot mark rows it has never been shown (its page may be stale, or narrowed by a filter).
 */
export async function newestNotificationAt(
  auditLog: AuditLog,
  preferences: NotificationPreferences,
): Promise<string | null> {
  const actions = actionsFor({}, preferences);
  if (actions.length === 0) return null;
  const { events } = await auditLog.query({ actions, outcome: 'success', limit: 1 });
  return events[0]?.at ?? null;
}
