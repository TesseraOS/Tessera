'use client';

import { ArrowRight, BookText, Boxes, FileMinus, FilePlus, RefreshCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Mascot } from '@tessera/mascot';
import { Button } from '@/components/ui/button';
import { useApiEvent, useEventsStatus } from '@/lib/api/events';
import { useNotifications, type FeedEntry } from '@/lib/store/notifications';

/**
 * The Overview's live activity feed (F-060; FR-38). Replaces the permanent "No activity yet" block
 * that shipped in F-014 with the real event stream.
 *
 * Live-session only (see `lib/store/notifications`) — the empty state says so rather than implying
 * that nothing has ever happened.
 */

/** Pump the live stream into the shared store. Mount once — the bell reads the same entries. */
export function useFeedIngest(): void {
  const push = useNotifications((state) => state.push);

  useApiEvent('memory.captured', (data) => push('memory.captured', data));
  useApiEvent('document.ingested', (data) => push('document.ingested', data));
  useApiEvent('document.removed', (data) => push('document.removed', data));
  useApiEvent('source.scan.started', (data) => push('source.scan.started', data));
  useApiEvent('source.scan.completed', (data) => push('source.scan.completed', data));
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

/** One line of prose + an icon for a feed entry. Pure, so it is unit-testable directly. */
export function describeEntry(entry: FeedEntry): {
  icon: LucideIcon;
  title: string;
  detail: string;
} {
  switch (entry.type) {
    case 'memory.captured':
      return {
        icon: BookText,
        title: text(entry.data['title'], 'Memory captured'),
        detail: `${text(entry.data['kind'], 'memory')} captured`,
      };
    case 'document.ingested':
      return {
        icon: FilePlus,
        title: text(entry.data['path'], 'Document ingested'),
        detail: 'indexed',
      };
    case 'document.removed':
      return {
        icon: FileMinus,
        title: text(entry.data['path'], 'Document removed'),
        detail: 'removed from the index',
      };
    case 'source.scan.started':
      return {
        icon: RefreshCw,
        title: text(entry.data['label'], 'Source'),
        detail: 'scan started',
      };
    case 'source.scan.completed': {
      const summary = entry.data['summary'];
      const counts =
        typeof summary === 'object' && summary !== null
          ? (summary as Record<string, unknown>)
          : undefined;
      const added = typeof counts?.['added'] === 'number' ? counts['added'] : undefined;
      return {
        icon: Boxes,
        title: text(entry.data['label'], 'Source'),
        detail: added === undefined ? 'scan completed' : `scan completed — ${added} added`,
      };
    }
  }
}

/** Relative time, coarse — the feed is a live cue, not a forensic log. */
export function relativeTime(at: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(at).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

export function ActivityFeed() {
  const entries = useNotifications((state) => state.entries);
  const status = useEventsStatus();

  if (entries.length === 0) {
    return (
      <div className="border-border/70 bg-background/40 flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed px-6 py-12 text-center">
        <Mascot mood="watching" size={92} />
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">No activity this session</p>
          <p className="text-muted-foreground mx-auto max-w-sm text-xs leading-relaxed">
            {status === 'reconnecting'
              ? 'Reconnecting to the live stream — activity will appear here once the connection is back.'
              : 'Ingests, scans, and captured memories appear here in real time as they happen. This feed covers the current session.'}
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
      <ul className="divide-border/60 divide-y" aria-label="Recent activity">
        {entries.map((entry) => {
          const { icon: Icon, title, detail } = describeEntry(entry);
          return (
            <li key={entry.id} className="flex items-center gap-3 py-2.5">
              <span className="bg-background/60 text-muted-foreground grid size-7 shrink-0 place-items-center rounded-md">
                <Icon className="size-3.5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">{title}</span>
                <span className="text-muted-foreground block truncate text-xs">{detail}</span>
              </span>
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {relativeTime(entry.at)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
