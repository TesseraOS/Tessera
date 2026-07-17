import { create } from 'zustand';

/**
 * Recently compiled tasks, so a task can be re-run without retyping it (F-062).
 *
 * **Live-session only, by design** — mirroring `lib/store/notifications.ts` (F-060) down to its
 * ethics: the list is what you compiled in *this tab*, and a reload starts empty. Persisting it is
 * not a `persist()` middleware call away: this holds **user-authored task text** ("audit the auth
 * bypass in payments"), which is user content — so a durable version needs server-side storage keyed
 * by `{tenantId, principalId}`, retention, DSR export/erasure (F-047), and audit. `localStorage`
 * would be the *wrong* answer: it survives sign-out on a shared machine, which is precisely the
 * bleed `clear()` exists to prevent.
 */

/** How many entries a session keeps. Beyond this the oldest fall off. */
export const RECENT_COMPILES_LIMIT = 8;

export interface RecentCompile {
  /** The compiled task text — the thing worth not retyping. */
  readonly task: string;
  readonly budget: number;
  /** Kind filters the compile was run with, if any. */
  readonly kinds?: readonly string[];
  /** Client time the compile completed (ISO). */
  readonly at: string;
}

export interface RecentCompilesState {
  readonly entries: readonly RecentCompile[];
  remember: (entry: Omit<RecentCompile, 'at'>) => void;
  /** Drop everything — called on sign-out so one user's tasks never bleed into the next session. */
  clear: () => void;
}

/**
 * Fold an entry into the list: newest first, de-duplicated by task text, capped.
 *
 * De-duplicating on `task` rather than on the whole entry is deliberate — re-running the same task
 * at a different budget should *move it to the top*, not accumulate near-identical rows. Pure and
 * exported so the state math unit-tests without a store or a render.
 */
export function rememberCompile(
  entries: readonly RecentCompile[],
  entry: RecentCompile,
  limit = RECENT_COMPILES_LIMIT,
): readonly RecentCompile[] {
  const withoutDuplicate = entries.filter((existing) => existing.task !== entry.task);
  return [entry, ...withoutDuplicate].slice(0, limit);
}

export const useRecentCompiles = create<RecentCompilesState>((set) => ({
  entries: [],
  remember: (entry) =>
    set((state) => ({
      entries: rememberCompile(state.entries, { ...entry, at: new Date().toISOString() }),
    })),
  clear: () => set({ entries: [] }),
}));
