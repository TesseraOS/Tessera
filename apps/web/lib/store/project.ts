'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** The reserved default project id (mirrors `@tessera/core`'s `DEFAULT_PROJECT_ID`). */
export const DEFAULT_PROJECT_ID = 'default';

/**
 * The selected project (F-050, ADR-0037). Persisted to `localStorage` so a reload stays in the same
 * workspace, and read **outside React** by the SDK fetch wrapper (see `lib/api/client.ts`) to attach the
 * `X-Tessera-Project` header to every request. Changing it re-scopes the whole dashboard: the app-shell
 * subscribes and invalidates the query cache so every view refetches for the new project.
 */
interface ProjectState {
  /** The active project id sent as `X-Tessera-Project`; `default` (or absent) → the reserved default. */
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      selectedProjectId: DEFAULT_PROJECT_ID,
      setSelectedProjectId: (id) => set({ selectedProjectId: id }),
    }),
    {
      name: 'tessera-project',
      storage: createJSONStorage(() => localStorage),
      // Only persist the id; the setter is recreated per load.
      partialize: (state) => ({ selectedProjectId: state.selectedProjectId }),
    },
  ),
);

/**
 * The currently selected project id, read synchronously **outside React** (the SDK fetch wrapper). Falls
 * back to the default project before hydration so the very first requests are still valid.
 */
export function getSelectedProjectId(): string {
  return useProjectStore.getState().selectedProjectId;
}
