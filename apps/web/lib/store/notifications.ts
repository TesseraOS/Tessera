import { create } from 'zustand';
import type { FeedEventType } from '@/lib/api/events';

/**
 * Live activity for the Overview feed + the notifications bell (F-060), in one store so both render
 * the same events and the bell's unread count means "since you last looked".
 *
 * **Live-session only, by design.** Events arrive over SSE and are held in memory; a reload starts
 * empty. That is the feature's stated scope — the persistent, per-user notification centre (with read
 * state that survives a reload, preferences, and an agent-readable surface) is F-065 and builds on
 * this. The UI must therefore never imply history it does not have: an empty feed says "nothing yet
 * **this session**", not "nothing ever happened".
 */

/** The most events retained in a session. Beyond this the oldest are dropped (F-065 persists). */
export const FEED_LIMIT = 50;

export interface FeedEntry {
  /** Stable id, monotonic within the session. */
  readonly id: string;
  readonly type: FeedEventType;
  /** Client receive time (ISO) — the wire payloads carry no timestamp (F-065 adds `occurredAt`). */
  readonly at: string;
  readonly data: Record<string, unknown>;
}

export interface NotificationsState {
  readonly entries: readonly FeedEntry[];
  /** Events received since the bell was last opened. */
  readonly unread: number;
  push: (type: FeedEventType, data: Record<string, unknown>) => void;
  /** Mark everything seen (the bell was opened). */
  markRead: () => void;
  /** Drop everything — used on sign-out so one user's activity never bleeds into the next session. */
  clear: () => void;
}

/** Fold one event into the feed. Pure + exported so the state math unit-tests without a socket. */
export function appendEntry(
  entries: readonly FeedEntry[],
  entry: FeedEntry,
  limit = FEED_LIMIT,
): readonly FeedEntry[] {
  return [entry, ...entries].slice(0, limit);
}

let sequence = 0;

export const useNotifications = create<NotificationsState>((set) => ({
  entries: [],
  unread: 0,
  push: (type, data) =>
    set((state) => ({
      entries: appendEntry(state.entries, {
        id: `${type}-${Date.now()}-${sequence++}`,
        type,
        at: new Date().toISOString(),
        data,
      }),
      unread: state.unread + 1,
    })),
  markRead: () => set({ unread: 0 }),
  clear: () => set({ entries: [], unread: 0 }),
}));
