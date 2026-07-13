'use client';

import { useMemo } from 'react';
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
        <ol className="space-y-0" aria-label="Activity timeline">
          {entries.map((entry, index) => (
            <TimelineRow key={entry.id} entry={entry} last={index === entries.length - 1} />
          ))}
        </ol>
      )}
    </div>
  );
}

function TimelineRow({ entry, last }: { entry: TimelineEntry; last: boolean }) {
  const Icon = CATEGORY_ICON[entry.category];
  return (
    <li className="flex gap-3">
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
    </li>
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
