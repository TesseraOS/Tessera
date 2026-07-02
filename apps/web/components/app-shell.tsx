import type { ReactNode } from 'react';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AppHeader } from '@/components/app-header';
import { AppSidebar } from '@/components/app-sidebar';
import { CommandPalette } from '@/components/command-palette';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden">
      <SidebarProvider className="relative h-svh">
        <a
          href="#main"
          className="bg-background focus:ring-ring sr-only z-50 rounded-md px-3 py-2 shadow focus:absolute focus:top-3 focus:left-3 focus:not-sr-only focus:ring-2"
        >
          Skip to content
        </a>
        <AppSidebar />
        <SidebarInset className="flex flex-col overflow-hidden md:peer-data-[variant=inset]:ml-0">
          <AppHeader />
          <main id="main" className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-6">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
      <CommandPalette />
    </div>
  );
}
