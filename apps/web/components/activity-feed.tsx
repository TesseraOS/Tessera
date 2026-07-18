'use client';

import {
  ArrowRight,
  BookText,
  Boxes,
  CreditCard,
  FileDown,
  FileX2,
  KeyRound,
  Package,
  RefreshCw,
  ScrollText,
  Timer,
  Trash2,
  Waypoints,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Mascot } from '@tessera/mascot';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useEventsStatus } from '@/lib/api/events';
import { useRecentActivity } from '@/lib/api/hooks';
import type { RecentActivityEvent } from '@/lib/api/types';

/**
 * The Overview's Recent activity feed (F-089; FR-38). Renders the **persisted trail** — the last N
 * successful work actions from `GET /v1/stats/activity/recent` — kept fresh by `ActivitySync`
 * (stream-driven invalidation). F-060's in-memory session store is gone: a reload shows the same
 * history every other surface shows, and no copy scopes itself to "this session" any more
 * (user items 4/6/9).
 */

/**
 * Icon, title, and a one-line description for a feed/bell row. Pure, so it is unit-testable
 * directly. The description is **derived from action semantics** — trail rows carry no content
 * (NFR-7: targets are route patterns or opaque ids) — and every branch supplies one, so no surface
 * ever renders a bare two-word title (F-091, user items 2/3). Kept short (≤ ~60 chars) so the
 * 320px bell popover truncates gracefully.
 */
export function describeEvent(event: Pick<RecentActivityEvent, 'action' | 'target' | 'actor'>): {
  icon: LucideIcon;
  title: string;
  description: string;
  detail?: string;
} {
  const { action, target } = event;
  // A target that is not a route pattern is an id worth showing (a memory lineage, for instance).
  const idTarget = target !== undefined && !target.startsWith('/') ? target : undefined;
  const base = (icon: LucideIcon, title: string, description: string) =>
    idTarget !== undefined
      ? { icon, title, description, detail: idTarget }
      : { icon, title, description };

  switch (action) {
    case 'memory.write':
      return target === '/v1/memory'
        ? {
            icon: BookText,
            title: 'Memory captured',
            description: 'New entry recorded to the workspace memory store.',
          }
        : base(BookText, 'Memory updated', 'An existing memory entry was revised.');
    case 'compile':
      return base(
        Package,
        'Context compiled',
        'Context pack assembled from indexed sources and memory.',
      );
    case 'effects.write':
      return base(
        Waypoints,
        'Effect link asserted',
        'Dependency edge recorded in the effect graph.',
      );
    case 'source.manage':
      switch (target) {
        case '/v1/sources':
          return {
            icon: Boxes,
            title: 'Source registered',
            description: 'New source connection added to the workspace.',
          };
        case '/v1/sources/:id/scan':
          return {
            icon: RefreshCw,
            title: 'Source scan started',
            description: 'Indexing of new and changed source content began.',
          };
        case '/v1/sources/:id':
          return {
            icon: Trash2,
            title: 'Source removed',
            description: 'Connection removed along with its indexed documents.',
          };
        default:
          return base(Boxes, 'Source updated', 'Source connection settings were changed.');
      }
    case 'token.manage':
      switch (target) {
        case '/v1/tokens':
          return {
            icon: KeyRound,
            title: 'API token issued',
            description: 'New token created for programmatic API access.',
          };
        case '/v1/tokens/:id':
          return {
            icon: KeyRound,
            title: 'API token revoked',
            description: 'Token invalidated; it can no longer authenticate.',
          };
        default:
          return base(KeyRound, 'Tokens updated', 'API token settings were changed.');
      }
    case 'billing.manage':
      return base(CreditCard, 'Billing updated', 'Subscription or payment details were changed.');
    case 'retention.manage':
      return target === '/v1/retention/prune'
        ? {
            icon: Timer,
            title: 'Retention prune run',
            description: 'Data past the retention window was purged.',
          }
        : base(Timer, 'Retention policy updated', 'Data lifecycle rules were changed.');
    case 'dsr.export':
      return base(FileDown, 'Data exported (DSR)', 'Data-subject export bundle was generated.');
    case 'dsr.delete':
      return base(FileX2, 'Data erased (DSR)', 'Subject data was permanently erased on request.');
    case 'audit.export':
      return base(
        ScrollText,
        'Audit trail exported',
        'Compliance export of the audit trail was generated.',
      );
    default:
      // A new audit action renders honestly before this map learns it.
      return base(
        ScrollText,
        action.replace(/[._]/g, ' '),
        'Recorded in the workspace audit trail.',
      );
  }
}

/** Relative time, coarse — the feed is a cue, not a forensic log (the row's title holds the exact time). */
export function relativeTime(at: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(at).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function ActivityFeed() {
  const { data, isPending, isError } = useRecentActivity();
  const status = useEventsStatus();
  const entries = data?.events ?? [];

  if (isPending) {
    return (
      <div className="space-y-2 py-1" aria-hidden="true">
        {['a', 'b', 'c'].map((key) => (
          <div key={key} className="flex items-center gap-3 py-1.5">
            <Skeleton className="size-7 rounded-md" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-44" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-muted-foreground py-6 text-center text-xs" role="status">
        Could not load recent activity. Is the Tessera API running?
      </p>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="border-border/70 bg-background/40 flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed px-6 py-12 text-center">
        <Mascot mood="watching" size={92} />
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">No recorded activity yet</p>
          <p className="text-muted-foreground mx-auto max-w-sm text-xs leading-relaxed">
            Scans, compiles, captured memories, and other workspace changes appear here — and stay
            here across reloads.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <Button asChild size="sm">
            <a href="/sources">
              <Boxes className="size-4" />
              Connect a source
            </a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href="/inspector">
              Compile context
              <ArrowRight className="size-4" />
            </a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {status === 'reconnecting' ? (
        <p className="text-muted-foreground px-1 pb-2 text-xs" role="status">
          Reconnecting to the live stream — this feed may be behind.
        </p>
      ) : null}
      {/*
        Bounded (the server caps the rows) and scrolls internally (F-080). The scroll lives on the
        `ul` itself: it carries the list role + label the Overview e2e resolves the feed by, and a
        scrollable region must be keyboard-reachable — no row is focusable, so without `tabIndex` a
        keyboard user could not scroll it at all (axe `scrollable-region-focusable`, WCAG 2.1.1).
      */}
      <ul
        className="divide-border/60 max-h-[22rem] divide-y overflow-y-auto"
        aria-label="Recent activity"
        tabIndex={0}
      >
        {entries.map((entry) => {
          const { icon: Icon, title, description, detail } = describeEvent(entry);
          return (
            <li key={entry.id} className="flex items-center gap-3 py-2.5">
              <span className="bg-background/60 text-muted-foreground grid size-7 shrink-0 place-items-center rounded-md">
                <Icon className="size-3.5" aria-hidden="true" />
              </span>
              {/* Always exactly two lines (the description is mandatory), so the chip and the
                  timestamp center against a deterministic block — no single-line rows floating
                  above the icon (F-091, user item 1). An id target rides the title line in mono
                  instead of claiming a third line. */}
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="shrink-0 truncate text-xs leading-4 font-medium">{title}</span>
                  {detail !== undefined ? (
                    <span className="text-muted-foreground min-w-0 truncate font-mono text-[10px]">
                      {detail}
                    </span>
                  ) : null}
                </span>
                <span className="text-muted-foreground block truncate text-[11px] leading-4">
                  {description}
                </span>
              </span>
              <span
                className="text-muted-foreground shrink-0 text-xs tabular-nums"
                title={new Date(entry.at).toLocaleString()}
              >
                {relativeTime(entry.at)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
