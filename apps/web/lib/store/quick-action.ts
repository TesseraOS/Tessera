'use client';

import { create } from 'zustand';

/**
 * A one-shot request from the ⌘K palette to a route's primary action (F-064; FR-49).
 *
 * The palette can navigate anywhere, but the actions it needs to trigger — capture a memory, register
 * a source — are dialogs owned by their own views as local state. Two ways to bridge that: lift each
 * dialog's open-flag into a global store, or leave ownership where it is and pass a *request* the view
 * consumes on arrival. This is the second.
 *
 * It matters because the palette usually fires from a different page: "Capture memory" pressed on
 * Settings has to navigate to /memory first, and the view does not exist yet at that moment. A
 * pending request survives the navigation; a direct call cannot.
 *
 * **One-shot by construction.** The consumer calls {@link consume}, which returns the request and
 * clears it in the same step — so a later remount, a back-navigation, or a second subscriber cannot
 * replay it and pop the dialog open again.
 */
export type QuickAction = 'capture-memory' | 'add-source';

interface QuickActionState {
  pending: QuickAction | null;
  request: (action: QuickAction) => void;
  /** Take the pending request if it matches `action`, clearing it. Returns whether it fired. */
  consume: (action: QuickAction) => boolean;
}

export const useQuickAction = create<QuickActionState>((set, get) => ({
  pending: null,
  request: (action) => set({ pending: action }),
  consume: (action) => {
    if (get().pending !== action) return false;
    set({ pending: null });
    return true;
  },
}));
