'use client';

import { usePathname } from 'next/navigation';
import { Bell, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppBreadcrumbs } from '@/components/app-breadcrumbs';
import { AppearanceSwitcher } from '@/components/appearance-switcher';
import { buildFlatNavLinks } from '@/components/app-shared';
import { CustomSidebarTrigger } from '@/components/custom-sidebar-trigger';
import { NavUser } from '@/components/nav-user';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCommandMenu } from '@/lib/store/command';

export function AppHeader() {
  const pathname = usePathname();
  const navLinks = buildFlatNavLinks(pathname);
  const activeItem = navLinks.find((item) => item.isActive) ?? null;
  const setOpen = useCommandMenu((state) => state.setOpen);

  return (
    <header className="bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 flex h-14 shrink-0 items-center gap-3 border-b px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-2">
        <CustomSidebarTrigger />
        <div className="bg-border mx-1 h-4 w-px shrink-0" />
        <AppBreadcrumbs page={activeItem} />
      </div>

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open command palette"
        className="text-muted-foreground bg-muted/60 hover:bg-muted hover:text-foreground focus-visible:ring-ring ml-auto inline-flex h-9 w-full max-w-[16rem] items-center gap-2 rounded-lg border border-transparent px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <Search className="size-4 shrink-0" />
        <span className="truncate">Search context…</span>
        <kbd className="bg-background text-muted-foreground ml-auto hidden items-center rounded border px-1.5 py-0.5 font-mono text-[10px] sm:inline-flex">
          ⌘K
        </kbd>
      </button>

      <div className="flex items-center gap-1.5">
        <NotificationsMenu />
        <AppearanceSwitcher />
        <NavUser />
      </div>
    </header>
  );
}

/** Notifications surface — functional shell with an honest empty state (feed wired when events land). */
function NotificationsMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Notifications">
          <Bell className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs font-medium">Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
          <span className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-full">
            <Bell className="size-4" />
          </span>
          <p className="text-sm font-medium">You&rsquo;re all caught up</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Ingestion, compilation, and system alerts will appear here.
          </p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
