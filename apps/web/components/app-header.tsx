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
import { describeEntry, relativeTime } from '@/components/activity-feed';
import { useCommandMenu } from '@/lib/store/command';
import { useNotifications } from '@/lib/store/notifications';

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

/**
 * Notifications (F-060) — the live event stream with an unread count, reading the same store as the
 * Overview's activity feed.
 *
 * **Live-session only** (see `lib/store/notifications`): the list is what arrived while this tab has
 * been open, and the copy says "this session" so the bell never implies a history it does not have.
 * F-065 makes it persistent and per-user.
 */
function NotificationsMenu() {
  const entries = useNotifications((state) => state.entries);
  const unread = useNotifications((state) => state.unread);
  const markRead = useNotifications((state) => state.markRead);

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) markRead();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative"
          aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
        >
          <Bell className="size-4" />
          {unread > 0 ? (
            <span
              data-testid="notifications-badge"
              className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full px-1 text-[10px] leading-4 font-semibold tabular-nums"
            >
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="text-xs font-medium">Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {entries.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
            <span className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-full">
              <Bell className="size-4" />
            </span>
            <p className="text-sm font-medium">You&rsquo;re all caught up</p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Ingestion, scans, and captured memories appear here as they happen this session.
            </p>
          </div>
        ) : (
          <ul className="max-h-80 overflow-y-auto py-1" aria-label="Recent notifications">
            {entries.map((entry) => {
              const { icon: Icon, title, detail } = describeEntry(entry);
              return (
                <li key={entry.id} className="flex items-start gap-2.5 px-2 py-2">
                  <span className="bg-muted text-muted-foreground mt-0.5 grid size-6 shrink-0 place-items-center rounded-md">
                    <Icon className="size-3" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{title}</span>
                    <span className="text-muted-foreground block truncate text-xs">{detail}</span>
                  </span>
                  <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
                    {relativeTime(entry.at)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
