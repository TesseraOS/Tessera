'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { CommandPalette } from '@/components/command-palette';
import { SidebarContent } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

/** The application shell: sidebar + topbar + content, with a mobile drawer and ⌘K palette. */
export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <a
        href="#main"
        className="focus:bg-background sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:not-sr-only focus:rounded-md focus:px-3 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>

      <aside className="bg-sidebar border-sidebar-border hidden w-64 shrink-0 border-r md:block">
        <SidebarContent />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMobileNav={() => setMobileOpen(true)} />

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="bg-sidebar w-64 p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        <main id="main" className="flex-1 p-6 lg:p-8">
          {children}
        </main>
      </div>

      <CommandPalette />
    </div>
  );
}
