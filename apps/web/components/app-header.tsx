'use client';

import { usePathname } from 'next/navigation';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppBreadcrumbs } from '@/components/app-breadcrumbs';
import { buildFlatNavLinks } from '@/components/app-shared';
import { CustomSidebarTrigger } from '@/components/custom-sidebar-trigger';
import { NavUser } from '@/components/nav-user';
import { ThemeToggle } from '@/components/theme-toggle';
import { useCommandMenu } from '@/lib/store/command';

export function AppHeader() {
  const pathname = usePathname();
  const navLinks = buildFlatNavLinks(pathname);
  const activeItem = navLinks.find((item) => item.isActive) ?? null;
  const setOpen = useCommandMenu((state) => state.setOpen);

  return (
    <header className="bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-3">
        <CustomSidebarTrigger />
        <div className="bg-border mx-1.5 h-4 w-px shrink-0" />
        <AppBreadcrumbs page={activeItem} />
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          aria-label="Open command palette"
          className="text-muted-foreground gap-2 font-normal"
        >
          <Search className="size-4" />
          <span className="hidden sm:inline">Search…</span>
          <kbd className="bg-muted text-muted-foreground ml-1 hidden rounded border px-1.5 py-0.5 font-mono text-[10px] sm:inline">
            ⌘K
          </kbd>
        </Button>
        <ThemeToggle />
        <NavUser />
      </div>
    </header>
  );
}
