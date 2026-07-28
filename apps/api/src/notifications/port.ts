import type { TenantId } from '@tessera/core';
import type { NotificationKind, NotificationPreferences, NotificationReadState } from './model.js';

/**
 * Retention for notification state (F-065; NFR-13).
 *
 * Deliberately narrow. The notifications themselves are a projection of the audit trail, so *they*
 * are pruned by the trail's own retention — there is no second corpus to age out. What accumulates
 * here is one row per principal, which is bounded by the number of principals, not by traffic; the
 * only thing worth reclaiming is state belonging to principals who have gone away.
 */
export interface NotificationRetentionPolicy {
  /**
   * Drop **read state** untouched for longer than this. Read marks are a convenience, not a record:
   * losing one re-shows a row that is far behind the watermark anyway.
   *
   * **Preferences are never pruned by age.** A preference is a setting a person chose, and silently
   * reverting it to the default because they were away is how a muted alert starts firing again.
   */
  readonly readStateMaxAgeMs?: number;
}

/**
 * Per-principal notification state (F-065; ADR-0064) — **the only part of a notification that is not
 * derived**. Read state answers "have I seen this?" and preferences answer "do I want to be told?";
 * everything else is projected from the audit trail at read time.
 *
 * **Tenant-scoped** via {@link NotificationStore.forTenant} (ADR-0033), then keyed by `principalId`
 * within it — the `{tenantId, principalId}` pair F-065's notes name. Both halves matter: one tenant
 * must never see another's state, and two people in one workspace must never share a read mark.
 *
 * Adapters: in-memory (the reference, driving the conformance suite) and SQLite (persistent, wired
 * by the composition root) — the F-027 audit-log pattern.
 */
export interface NotificationStore {
  /** This principal's read state; {@link import('./model.js').EMPTY_READ_STATE} when it has none. */
  readState(principalId: string): Promise<NotificationReadState>;
  /**
   * Mark notifications read, returning the updated state. Idempotent and capped
   * ({@link import('./model.js').READ_IDS_CAP}); ids already implied by the watermark are absorbed.
   */
  markRead(principalId: string, ids: readonly string[]): Promise<NotificationReadState>;
  /**
   * Move the watermark to `at` ("mark all as read"), returning the updated state. The watermark only
   * moves **forward**, so a client posting a stale instant cannot un-read newer rows.
   */
  markAllRead(principalId: string, at: string): Promise<NotificationReadState>;
  /** This principal's preferences, completed with defaults for kinds the store has not stored. */
  preferences(principalId: string): Promise<NotificationPreferences>;
  /**
   * Merge a partial preference update over the stored record and return the complete result. Partial
   * so a client that has not learned a new kind cannot mute it by omission.
   */
  setPreferences(
    principalId: string,
    update: Readonly<Partial<Record<NotificationKind, boolean>>>,
  ): Promise<NotificationPreferences>;
  /** Erase everything held for one principal — read state *and* preferences (DSR erasure, NFR-13). */
  forget(principalId: string): Promise<void>;
  /** Apply a retention policy within the bound tenant; returns the number of rows removed. */
  prune(policy: NotificationRetentionPolicy): Promise<number>;
  /** A view of this store confined to `tenantId`. The base store operates in the default tenant. */
  forTenant(tenantId: TenantId): NotificationStore;
}
