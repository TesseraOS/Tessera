'use client';

import { create } from 'zustand';

/**
 * Open-state for the shared "New project" dialog (F-050). The dialog is mounted once (in the app-shell
 * project switcher); the switcher, the '+ New' quick-create menu, and the ⌘K command palette all open it
 * through this store, so "New project" has one home and one implementation (the 2026-07-04 decision).
 */
interface NewProjectDialogState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useNewProjectDialog = create<NewProjectDialogState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
