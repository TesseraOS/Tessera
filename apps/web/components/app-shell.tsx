'use client';

import type { ReactNode } from 'react';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AppHeader } from '@/components/app-header';
import { AppSidebar } from '@/components/app-sidebar';
import { CommandPalette } from '@/components/command-palette';

/** The application shell: shadcn Sidebar (collapsible) + inset header/content + ⌘K palette. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <a
        href="#main"
        className="bg-background focus:ring-ring sr-only z-50 rounded-md px-3 py-2 shadow focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:ring-2"
      >
        Skip to content
      </a>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <main id="main" className="flex flex-1 flex-col gap-4 p-4 md:p-6">
          {children}
        </main>
      </SidebarInset>
      <CommandPalette />
    </SidebarProvider>
  );
}
