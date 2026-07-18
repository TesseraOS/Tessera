import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Per-message **read state** for the notifications bell (F-089).
 *
 * The entries themselves are no longer stored here: since F-089 the feed and the bell render the
 * persisted trail (`GET /v1/stats/activity/recent` — see `useRecentActivity`), so a reload shows
 * the same history every other surface shows. What genuinely belongs to this client is only *which
 * of those rows this user has seen* — the trail is append-only and shared, so read marks cannot
 * live in it.
 *
 * **Persisted per device** (`localStorage`), keyed by `tenantId:principalId` so two users of one
 * browser never share marks, and **wiped on sign-out** (`clear()`, called by the session provider —
 * the same shared-machine hygiene F-060 documented). What persists is opaque event ids + one
 * timestamp — never content, which is why the recent-compiles objection to `localStorage` does not
 * apply here. Cross-device read state needs a server store and stays F-065's deliverable.
 *
 * The state math is in pure, exported helpers so it unit-tests without a store or storage.
 */

export interface ReadState {
  /** Everything at or before this ISO instant is read ("mark all as read" sets it). */
  readonly watermark: string | null;
  /** Individually-read event ids newer than the watermark. */
  readonly readIds: readonly string[];
}

export const EMPTY_READ_STATE: ReadState = { watermark: null, readIds: [] };

/**
 * Cap on individually-marked ids. The feed serves ≤50 rows, so 200 is generous headroom; beyond it
 * the oldest marks fall off (those rows have long since left the feed).
 */
export const READ_IDS_CAP = 200;

/** Whether one feed entry is read under `state`. */
export function isRead(entry: { id: string; at: string }, state: ReadState): boolean {
  if (state.watermark !== null && entry.at <= state.watermark) return true;
  return state.readIds.includes(entry.id);
}

/** How many of `entries` are unread under `state`. */
export function unreadCount(
  entries: readonly { id: string; at: string }[],
  state: ReadState,
): number {
  return entries.reduce((count, entry) => count + (isRead(entry, state) ? 0 : 1), 0);
}

/** `state` with one id marked read (idempotent, capped). Pure. */
export function withRead(state: ReadState, id: string): ReadState {
  if (state.readIds.includes(id)) return state;
  return { ...state, readIds: [...state.readIds, id].slice(-READ_IDS_CAP) };
}

/**
 * `state` after "mark all as read" at `newestAt` (the newest visible entry's timestamp). The
 * watermark only moves forward, and individual marks below it are pruned — they are implied.
 */
export function withAllRead(state: ReadState, newestAt: string): ReadState {
  const watermark =
    state.watermark !== null && state.watermark > newestAt ? state.watermark : newestAt;
  return { watermark, readIds: [] };
}

interface NotificationsReadStore {
  /** Read state per `tenantId:principalId`, so users of a shared browser never share marks. */
  readonly byIdentity: Readonly<Record<string, ReadState>>;
  markRead: (identity: string, id: string) => void;
  markAllRead: (identity: string, newestAt: string) => void;
  /** Drop everything — called on sign-out so no trace of one user's marks outlives their session. */
  clear: () => void;
}

/** Build the per-identity key. Falls back to the local principal when unauthenticated. */
export function identityKeyOf(
  identity: { tenantId: string; principal: { id: string } } | null,
): string {
  return identity === null ? 'default:local' : `${identity.tenantId}:${identity.principal.id}`;
}

export const useNotificationsRead = create<NotificationsReadStore>()(
  persist(
    (set) => ({
      byIdentity: {},
      markRead: (identity, id) =>
        set((state) => ({
          byIdentity: {
            ...state.byIdentity,
            [identity]: withRead(state.byIdentity[identity] ?? EMPTY_READ_STATE, id),
          },
        })),
      markAllRead: (identity, newestAt) =>
        set((state) => ({
          byIdentity: {
            ...state.byIdentity,
            [identity]: withAllRead(state.byIdentity[identity] ?? EMPTY_READ_STATE, newestAt),
          },
        })),
      clear: () => set({ byIdentity: {} }),
    }),
    {
      name: 'tessera.notifications.read.v1',
      // SSR-safe: on the server there is no localStorage; createJSONStorage handles the absence and
      // persist simply skips hydration there.
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
