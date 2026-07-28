/**
 * Notification domain model (F-065; FR-38/FR-49). Pure data + pure functions — no I/O, no Fastify,
 * so REST and MCP wrap the identical logic (ADR-0036) and the composition root can build a
 * persistent store without pulling Fastify in.
 *
 * **A notification is a projection of the audit trail, not a second record of it** (ADR-0064). The
 * trail already holds every notifiable fact — who did what, to what, when — persisted, tenant-scoped
 * and retention-pruned. What it cannot hold is *whether you have seen it* (append-only, and read
 * state is per person) or *whether you want to be told* (a preference, not an event). Those two are
 * what the {@link import('./port.js').NotificationStore} persists; everything else is derived here.
 */
import type { AuditAction, AuditActor } from '../audit/model.js';

/**
 * The kinds a notification can have. Deliberately **short**: a notification interrupts someone, so
 * the bar is "would a reasonable person want to be told?", not "did something happen". Every other
 * audited action stays in the activity feed and the trail, where it belongs.
 *
 * Every kind here has a real producer. `system.alert` is *not* defined: nothing emits it, and a
 * preference toggle that can never fire is a promise the product does not keep. When a producer
 * exists (a readiness-check transition, say), the kind arrives with it.
 */
export const NOTIFICATION_KINDS = [
  'memory.captured',
  'scan.completed',
  'scan.failed',
  'token.changed',
  'plan.changed',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** How loudly a kind should present. Derived from the kind — never chosen per event. */
export const NOTIFICATION_SEVERITIES = ['info', 'warning', 'error'] as const;
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

/**
 * Audit action → notification kind. The **whole** taxonomy: an action absent from this map produces
 * no notification, which is the common case.
 *
 * `token.manage` collapses to one `token.changed` rather than the `token.created`/`token.revoked`
 * pair F-065's acceptance names, because the trail records a single action for both. The dashboard
 * *presentation* distinguishes them by route pattern (`describeEvent`), but a kind is a contract —
 * preferences key off it and agents filter on it — so it must be derived from what the recorder
 * guarantees, not from a URL shape a future route split could silently flip.
 */
const KIND_BY_ACTION: Partial<Record<AuditAction, NotificationKind>> = {
  'memory.write': 'memory.captured',
  'source.scan.completed': 'scan.completed',
  'source.scan.failed': 'scan.failed',
  'token.manage': 'token.changed',
  'billing.manage': 'plan.changed',
};

export const SEVERITY_BY_KIND: Readonly<Record<NotificationKind, NotificationSeverity>> = {
  'memory.captured': 'info',
  'scan.completed': 'info',
  // A failed scan is the reason this feature earns its place: the request that started it was
  // answered 202 minutes ago and nobody is watching the stream any more.
  'scan.failed': 'error',
  // Not an error — but somebody minting or revoking API credentials is a security fact, and the
  // person who did not do it is the one who needs to see it.
  'token.changed': 'warning',
  'plan.changed': 'info',
};

/** The audit actions that project to a notification — the query filter, derived from one map. */
export const NOTIFIABLE_ACTIONS: readonly AuditAction[] = Object.keys(
  KIND_BY_ACTION,
) as AuditAction[];

/** The notification kind an audit action projects to, or `undefined` when it projects to none. */
export function kindForAction(action: AuditAction): NotificationKind | undefined {
  return KIND_BY_ACTION[action];
}

/** The kinds at a given severity — how a severity filter is pushed into the trail query exactly. */
export function kindsWithSeverity(severity: NotificationSeverity): readonly NotificationKind[] {
  return NOTIFICATION_KINDS.filter((kind) => SEVERITY_BY_KIND[kind] === severity);
}

/**
 * One notification as a caller sees it.
 *
 * **No rendered prose, deliberately.** The `kind` *is* the message: the dashboard renders copy
 * through `lib/i18n` (so it can be translated) and an agent reads the kind directly (so it stays
 * token-lean). A server-rendered English sentence would defeat both and duplicate `describeEvent`.
 */
export interface Notification {
  /** The projected audit event's id — stable, opaque, and what a read mark refers to. */
  readonly id: string;
  readonly kind: NotificationKind;
  readonly severity: NotificationSeverity;
  /** Who caused it. Present because "who revoked that token?" is the first question asked. */
  readonly actor: AuditActor;
  /** Non-sensitive target ref (an id or a route pattern) — the trail's own guarantee (NFR-7). */
  readonly target?: string;
  /** ISO-8601 (UTC) instant the underlying action happened. */
  readonly at: string;
  /** Whether this principal has seen it — the one field that is not derived from the trail. */
  readonly read: boolean;
}

/**
 * Which kinds notify this principal. Every kind is present (no partial records), so a kind added to
 * the catalog later has a defined answer for an existing stored preference rather than an implicit
 * one — see {@link withPreferenceDefaults}.
 */
export type NotificationPreferences = Readonly<Record<NotificationKind, boolean>>;

/**
 * Default preferences: **everything on**. A notification centre that starts silent teaches people
 * it is empty, and the kinds are few enough that "on" is not noise. Opting out is one toggle.
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = Object.freeze(
  Object.fromEntries(NOTIFICATION_KINDS.map((kind) => [kind, true])),
) as NotificationPreferences;

/**
 * Complete a stored (possibly partial, possibly stale) preference record. A kind the store has
 * never heard of defaults to on — the same answer a brand-new principal gets, so adding a kind
 * cannot silently mute it for everyone who saved preferences before it existed.
 */
export function withPreferenceDefaults(
  stored: Readonly<Partial<Record<NotificationKind, boolean>>> | undefined,
): NotificationPreferences {
  if (stored === undefined) return DEFAULT_NOTIFICATION_PREFERENCES;
  return Object.fromEntries(
    NOTIFICATION_KINDS.map((kind) => [kind, stored[kind] ?? true]),
  ) as NotificationPreferences;
}

/**
 * Per-principal read state (F-065), promoted from F-089's per-device `localStorage` store — which
 * is exactly why this feature exists: read state that lives in one browser is not read state.
 *
 * `watermark` is "everything at or before this instant is read" (what *mark all as read* sets);
 * `readIds` holds individually-read ids newer than it.
 */
export interface NotificationReadState {
  readonly watermark: string | null;
  readonly readIds: readonly string[];
}

export const EMPTY_READ_STATE: NotificationReadState = { watermark: null, readIds: [] };

/**
 * Cap on individually-marked ids kept per principal. The list serves ≤ {@link MAX_NOTIFICATION_PAGE_SIZE}
 * rows, so this is generous headroom; beyond it the oldest marks fall off — those rows are far
 * behind the watermark's reach and re-showing one is a smaller harm than an unbounded row.
 */
export const READ_IDS_CAP = 200;

/** Whether a projected event is read under `state`. ISO timestamps compare lexicographically (UTC). */
export function isRead(entry: { id: string; at: string }, state: NotificationReadState): boolean {
  if (state.watermark !== null && entry.at <= state.watermark) return true;
  return state.readIds.includes(entry.id);
}

/** `state` with one id marked read (idempotent, capped). Pure. */
export function withRead(state: NotificationReadState, id: string): NotificationReadState {
  if (state.readIds.includes(id)) return state;
  return { ...state, readIds: [...state.readIds, id].slice(-READ_IDS_CAP) };
}

/**
 * `state` after "mark all as read" up to `newestAt`. The watermark only moves **forward** — a client
 * with a stale page must never un-read newer rows — and individual marks below it are dropped
 * because the watermark already implies them.
 */
export function withAllRead(state: NotificationReadState, newestAt: string): NotificationReadState {
  const watermark =
    state.watermark !== null && state.watermark > newestAt ? state.watermark : newestAt;
  return { watermark, readIds: [] };
}

export const DEFAULT_NOTIFICATION_PAGE_SIZE = 20;
export const MAX_NOTIFICATION_PAGE_SIZE = 50;

/**
 * How far back {@link import('./project.js').unreadCountFor} looks.
 *
 * Bounded on purpose. "How many unread?" over an unbounded trail is a full scan that grows without
 * limit, for a number rendered as `9+` past single digits. This counts within the newest
 * {@link NOTIFICATION_UNREAD_WINDOW} notifications and the API says so, which is the honest version
 * of a badge — as opposed to a number that is exact until the day it is slow.
 */
export const NOTIFICATION_UNREAD_WINDOW = 100;
