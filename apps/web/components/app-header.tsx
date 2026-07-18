'use client';

import { usePathname } from 'next/navigation';
import { Bell, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppBreadcrumbs } from '@/components/app-breadcrumbs';
import { AppearanceSwitcher } from '@/components/appearance-switcher';
import { buildFlatNavLinks } from '@/components/app-shared';
import { CustomSidebarTrigger } from '@/components/custom-sidebar-trigger';
import { NavUser } from '@/components/nav-user';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { describeEvent, relativeTime } from '@/components/activity-feed';
import { cn } from '@/lib/utils';
import { useRecentActivity } from '@/lib/api/hooks';
import { useSession } from '@/lib/auth/use-session';
import { useCommandMenu } from '@/lib/store/command';
import {
  EMPTY_READ_STATE,
  identityKeyOf,
  isRead,
  unreadCount,
  useNotificationsRead,
} from '@/lib/store/notifications';

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
 * Notifications (F-089) — the persisted Recent activity entries with **per-message read state**.
 *
 * The entries are the audit trail's recent work actions (`useRecentActivity` — the same query the
 * Overview feed renders), so they survive a reload. Read marks are per message: clicking a row
 * marks it read (the menu stays open so several can be cleared in a pass), "Mark all as read"
 * watermarks everything visible, and — unlike F-060 — merely *opening* the bell claims nothing.
 * Marks persist per device, keyed by identity, wiped on sign-out (`lib/store/notifications`).
 */
function NotificationsMenu() {
  const { data, isPending, isError, refetch } = useRecentActivity();
  const { identity } = useSession();
  const identityKey = identityKeyOf(identity);
  const readState = useNotificationsRead(
    (state) => state.byIdentity[identityKey] ?? EMPTY_READ_STATE,
  );
  const markRead = useNotificationsRead((state) => state.markRead);
  const markAllRead = useNotificationsRead((state) => state.markAllRead);

  const entries = data?.events ?? [];
  const unread = unreadCount(entries, readState);
  const newest = entries[0];

  return (
    // A Popover, not a DropdownMenu: `role="menu"` may only contain menu items, and this panel
    // holds a list plus real buttons (per-message read marking) — dialog semantics are the correct
    // ARIA shape for a notification panel, and the home e2e's scoped axe sweep pins it.
    <Popover>
      <PopoverTrigger asChild>
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
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-1">
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <h2 className="text-xs font-medium">Notifications</h2>
          {unread > 0 && newest !== undefined ? (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
              onClick={() => markAllRead(identityKey, newest.at)}
            >
              Mark all as read
            </button>
          ) : null}
        </div>
        <Separator className="-mx-1 w-auto" />
        {isPending ? (
          // The fetch is in flight — say so (F-091, user item 4). The empty-state copy below would
          // be a lie here: the trail may well have history that simply hasn't arrived yet.
          <div className="py-1">
            <p className="sr-only" role="status">
              Loading notifications…
            </p>
            <div aria-hidden="true">
              {['a', 'b', 'c'].map((key) => (
                <div key={key} className="flex items-center gap-2.5 px-2 py-2">
                  <Skeleton className="size-6 shrink-0 rounded-md" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-3 w-44" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2.5 px-4 py-6 text-center">
            <p className="text-muted-foreground text-xs" role="status">
              Notifications could not be loaded.
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
            <span className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-full">
              <Bell className="size-4" />
            </span>
            <p className="text-sm font-medium">Nothing here yet</p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Scans, compiles, and captured memories land here — and stay here across reloads.
            </p>
          </div>
        ) : (
          <ul className="max-h-80 overflow-y-auto py-1" aria-label="Recent notifications">
            {entries.map((entry) => {
              const { icon: Icon, title, description } = describeEvent(entry);
              const read = isRead(entry, readState);
              return (
                <li key={entry.id}>
                  {/*
                    A plain button — clicking marks the row read and the panel stays open, so
                    several can be cleared in a pass (the whole point of per-message marks).
                    Every row is exactly two lines (title + mandatory description), so
                    `items-center` holds the chip, text block, and meta on one rhythm — the
                    single-line-title misalignment is structurally gone (F-091, user item 1).
                  */}
                  <button
                    type="button"
                    onClick={() => markRead(identityKey, entry.id)}
                    aria-label={`${title} — mark as read`}
                    className="hover:bg-accent focus-visible:ring-ring flex w-full items-center gap-2.5 rounded-sm px-2 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <span className="bg-muted text-muted-foreground grid size-6 shrink-0 place-items-center rounded-md">
                      <Icon className="size-3" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block truncate text-xs leading-4',
                          read ? 'text-muted-foreground font-normal' : 'font-medium',
                        )}
                      >
                        {title}
                      </span>
                      <span className="text-muted-foreground block truncate text-[11px] leading-4">
                        {description}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span
                        className="text-muted-foreground text-[10px] tabular-nums"
                        title={new Date(entry.at).toLocaleString()}
                      >
                        {relativeTime(entry.at)}
                      </span>
                      {!read ? (
                        <span
                          className="bg-primary size-1.5 rounded-full"
                          aria-hidden="true"
                          data-testid="notification-unread-dot"
                        />
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
