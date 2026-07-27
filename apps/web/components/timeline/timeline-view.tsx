'use client';

import { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Activity,
  FileText,
  type LucideIcon,
  NotebookText,
  RefreshCw,
  ScrollText,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TimeRiver } from '@/components/art';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { cn } from '@/lib/utils';
import { useAudit, useMemories } from '@/lib/api/hooks';
import { useLiveActivity } from '@/lib/api/events';
import { AUDIT_ACTION_LABELS } from '@/lib/governance';
import { MEMORY_KIND_LABELS, formatTimestamp } from '@/lib/memory';
import { buildTimeline, type TimelineCategory, type TimelineEntry } from './timeline';

const CATEGORY_ICON: Record<TimelineCategory, LucideIcon> = {
  memory: NotebookText,
  audit: ScrollText,
  ingest: FileText,
  scan: RefreshCw,
};

/**
 * Timeline (FR-43) — a unified, time-ordered activity feed built from memory lineages, audit events,
 * and live SSE updates (appended as they arrive). Real data (ADR-0022); audit is best-effort (it is
 * admin-scoped, so on a restricted deployment the feed degrades to memories + live activity).
 */
export function TimelineView() {
  const memories = useMemories();
  const audit = useAudit();
  const live = useLiveActivity();

  const entries = useMemo(
    () =>
      buildTimeline({
        memories: memories.data?.memories ?? [],
        audit: audit.data?.events ?? [],
        live,
        auditLabels: AUDIT_ACTION_LABELS,
        kindLabels: MEMORY_KIND_LABELS,
      }),
    [memories.data, audit.data, live],
  );

  return (
    <div className="space-y-4">
      <Card className="bg-sidebar border-none p-4 shadow-none dark:ring-0">
        <CardHeader className="flex-row items-center gap-2 space-y-0 p-0">
          <Activity className="text-muted-foreground size-4" aria-hidden="true" />
          <div className="space-y-1">
            <CardTitle>Timeline</CardTitle>
            <CardDescription>
              Decisions, lessons, ingest activity, and access events in time order — live updates
              appear as they happen.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      {memories.isError ? (
        <ErrorState
          mascot
          title="Could not load the timeline"
          description={
            memories.error instanceof Error ? memories.error.message : 'Is the Tessera API running?'
          }
          onRetry={() => void memories.refetch()}
        />
      ) : memories.isPending ? (
        <TimelineSkeleton />
      ) : entries.length === 0 ? (
        <EmptyState
          art={<TimeRiver />}
          title="No activity yet"
          description="Capture a memory or scan a source — events will appear here in real time."
        />
      ) : (
        <VirtualTimeline entries={entries} />
      )}
    </div>
  );
}

/**
 * The virtualized feed (F-064; FR-49). The timeline merges memory lineages, the audit trail and live
 * SSE activity, so it is the list in the dashboard most likely to grow without bound — and it was the
 * one long list still rendering every row.
 *
 * Unlike `ui/data-table`, this keeps NATIVE list semantics — no explicit `role="list"`/`role="listitem"`.
 * The worry was that absolutely positioning a row blockifies it and drops the implicit `listitem`
 * role, which is the real reason the data-table declares its grid roles. It was **tested rather than
 * assumed**: with the roles removed, the e2e still resolves the list and its items through the
 * accessibility tree in Chromium, and axe passes over 500 entries. A `<table>` genuinely loses its
 * roles under `display: block`; an `<ol>` does not, so declaring them here would be the redundancy
 * `jsx-a11y/no-redundant-roles` exists to catch.
 *
 * The `<ol>` is the virtualizer's height spacer, so the rendered `<li>` remain its DIRECT children —
 * an intermediate spacer div would break `aria-required-children`. Row heights vary (titles wrap),
 * so rows are measured rather than estimated.
 */
function VirtualTimeline({ entries }: { entries: readonly TimelineEntry[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => TIMELINE_ROW_ESTIMATE,
    overscan: 8,
  });

  return (
    // The scroller is a FOCUSABLE, labelled region. Without `tabIndex`, axe fails
    // `scrollable-region-focusable` (serious): a keyboard-only user can reach the rows' links but can
    // never scroll the container itself, so anything below the fold is unreachable. It cannot be the
    // `<ol>` — that element carries the virtualizer's total height, and a scroll container has to be
    // the fixed-height ancestor of the thing it scrolls.
    <div
      ref={scrollRef}
      tabIndex={0}
      role="region"
      aria-label="Activity timeline"
      className="focus-visible:ring-ring max-h-[70vh] overflow-y-auto rounded-md focus-visible:ring-2 focus-visible:outline-none"
    >
      <ol className="relative w-full" style={{ height: `${String(virtualizer.getTotalSize())}px` }}>
        {virtualizer.getVirtualItems().map((item) => {
          const entry = entries[item.index];
          if (entry === undefined) return null;
          return (
            <li
              key={entry.id}
              data-index={item.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 flex w-full gap-3"
              style={{ transform: `translateY(${String(item.start)}px)` }}
            >
              <TimelineRowBody entry={entry} last={item.index === entries.length - 1} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Estimated row height before measurement; rows are measured, so this only affects the first paint. */
const TIMELINE_ROW_ESTIMATE = 76;

/**
 * A row's contents, without its `<li>` — the list item is owned by {@link VirtualTimeline}, which has
 * to position and measure it. Splitting here keeps the virtualization concern out of the presentation.
 */
function TimelineRowBody({ entry, last }: { entry: TimelineEntry; last: boolean }) {
  const Icon = CATEGORY_ICON[entry.category];
  return (
    <>
      <div className="flex flex-col items-center">
        <span className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-full [&_svg]:size-3.5">
          <Icon aria-hidden="true" />
        </span>
        {!last ? <span className="bg-border w-px flex-1" aria-hidden="true" /> : null}
      </div>
      <div className="min-w-0 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-foreground text-sm font-medium">{entry.title}</span>
          {entry.kind ? (
            <Badge variant="secondary" className="h-4 text-[10px] capitalize">
              {MEMORY_KIND_LABELS[entry.kind]}
            </Badge>
          ) : null}
          {entry.live ? (
            <Badge
              variant="outline"
              className={cn('border-primary/40 text-primary h-4 gap-1 text-[10px]')}
            >
              live
            </Badge>
          ) : null}
        </div>
        {entry.detail ? (
          <p className="text-muted-foreground mt-0.5 truncate text-xs">{entry.detail}</p>
        ) : null}
        <p className="text-muted-foreground mt-0.5 font-mono text-[11px]">
          {formatTimestamp(entry.at)}
        </p>
      </div>
    </>
  );
}

function TimelineSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      {['a', 'b', 'c', 'd'].map((key) => (
        <div key={key} className="flex gap-3">
          <Skeleton className="size-7 rounded-full" />
          <div className="flex-1 space-y-2 pb-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
