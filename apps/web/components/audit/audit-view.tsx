'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { LedgerGate } from '@/components/art';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { AuditExport } from '@/components/audit/audit-export';
import { cn } from '@/lib/utils';
import { useAuditInfinite } from '@/lib/api/hooks';
import {
  ALL,
  EMPTY_AUDIT_FILTERS,
  hasActiveFilters,
  toAuditQuery,
  type AuditFilters,
} from '@/lib/audit/query';
import type { AuditAction, AuditEvent, AuditOutcome } from '@/lib/api/types';
import { AUDIT_ACTION_LABELS, AUDIT_ACTIONS, AUDIT_OUTCOMES } from '@/lib/governance';

/** Format an ISO timestamp for the table (client-only render → no SSR hydration mismatch). */
function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/**
 * Audit log (FR-48/55) — who did what, to what, with what outcome, when.
 *
 * **Audit v2 (F-063).** The trail is now genuinely reachable: `useAuditInfinite` follows the keyset
 * cursor the API has always returned, replacing the hint that told the user to "narrow the filters to
 * see older entries" while the component held a working cursor in its hand. Filters gained actor and
 * a date range (both long supported on the wire, never surfaced), and the filtered trail can be
 * exported — with the export itself recorded in the trail it exported.
 *
 * **There is no column sorting, and that is deliberate.** The cursor *is* the sort order: `seq <
 * cursor` is only a valid page boundary while rows are ordered by `seq`, and the API has no sort
 * parameter because a compliance trail is chronological by nature. Sorting the loaded window would
 * present "sorted by actor" while showing page 1 of 40 — the same dishonesty this feature deletes,
 * in a better suit. "What did this actor do?" and "what happened on Tuesday?" are *filters*, and
 * those are here.
 */
export function AuditView() {
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_AUDIT_FILTERS);
  const query = useMemo(() => toAuditQuery(filters), [filters]);

  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAuditInfinite(query);

  const events = useMemo(() => data?.pages.flatMap((page) => page.events) ?? [], [data]);
  const columns = useMemo(() => auditColumns(), []);

  return (
    <div className="space-y-4">
      <Card className="bg-sidebar border-none p-4 shadow-none dark:ring-0">
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 p-0 pb-3">
          <div className="space-y-1.5">
            <CardTitle>Audit log</CardTitle>
            <CardDescription>
              Every sensitive action across this workspace — access, writes, and admin — recorded
              immutably for compliance.
            </CardDescription>
          </div>
          <AuditExport query={query} />
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2 p-0 pt-4">
          <Select
            value={filters.action}
            onValueChange={(value) =>
              setFilters((f) => ({ ...f, action: value as AuditAction | typeof ALL }))
            }
          >
            <SelectTrigger className="h-9 w-[180px]" aria-label="Filter by action">
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All actions</SelectItem>
              {AUDIT_ACTIONS.map((value) => (
                <SelectItem key={value} value={value}>
                  {AUDIT_ACTION_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.outcome}
            onValueChange={(value) =>
              setFilters((f) => ({ ...f, outcome: value as AuditOutcome | typeof ALL }))
            }
          >
            <SelectTrigger className="h-9 w-[150px]" aria-label="Filter by outcome">
              <SelectValue placeholder="All outcomes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All outcomes</SelectItem>
              {AUDIT_OUTCOMES.map((value) => (
                <SelectItem key={value} value={value}>
                  {value === 'success' ? 'Success' : 'Denied'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            value={filters.actor}
            onChange={(event) => setFilters((f) => ({ ...f, actor: event.target.value }))}
            placeholder="Actor principal id"
            aria-label="Filter by actor"
            className="h-9 w-[200px] text-xs"
          />

          <div className="flex items-end gap-1.5">
            <label className="space-y-1" htmlFor="audit-from">
              <span className="text-muted-foreground block text-[11px]">From</span>
              <Input
                id="audit-from"
                type="date"
                value={filters.from}
                onChange={(event) => setFilters((f) => ({ ...f, from: event.target.value }))}
                className="h-9 w-[150px] text-xs"
              />
            </label>
            <label className="space-y-1" htmlFor="audit-to">
              <span className="text-muted-foreground block text-[11px]">To</span>
              <Input
                id="audit-to"
                type="date"
                value={filters.to}
                onChange={(event) => setFilters((f) => ({ ...f, to: event.target.value }))}
                className="h-9 w-[150px] text-xs"
              />
            </label>
          </div>

          {hasActiveFilters(filters) ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-9 text-xs"
              onClick={() => setFilters(EMPTY_AUDIT_FILTERS)}
            >
              Clear filters
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {isError ? (
        <ErrorState
          mascot
          title="Could not load the audit log"
          description={error instanceof Error ? error.message : 'Unknown error'}
          onRetry={() => void refetch()}
        />
      ) : isPending ? (
        <AuditSkeleton />
      ) : events.length === 0 ? (
        <EmptyState
          art={<LedgerGate />}
          title="No audit events"
          description={
            hasActiveFilters(filters)
              ? 'Nothing matches these filters. Clear them, or widen the date range.'
              : 'Nothing recorded yet. Sensitive actions appear here as they happen.'
          }
        />
      ) : (
        <>
          <Card className="bg-sidebar border-none p-0 shadow-none dark:ring-0">
            <CardContent className="p-0">
              <DataTable
                columns={columns}
                rows={events}
                rowKey={(event) => event.id}
                label="Audit events"
                busy={isFetching && !isFetchingNextPage}
              />
            </CardContent>
          </Card>

          <div className="flex items-center gap-3 px-1">
            {/* The cursor this component always had, finally used. An explicit button rather than
                infinite scroll: a compliance view must be reproducible ("I am looking at 150
                events"), and a load-trigger inside a virtual window may not be in the DOM when a
                keyboard user reaches the end. */}
            {hasNextPage ? (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => void fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <ChevronDown className="size-3.5" aria-hidden="true" />
                )}
                Load older events
              </Button>
            ) : null}
            <span className="text-muted-foreground text-xs" role="status">
              {/* Says what is LOADED, and whether more exists — never a total we do not have. */}
              Showing {events.length.toLocaleString()} event{events.length === 1 ? '' : 's'}
              {hasNextPage ? ' · more available' : ' · end of the trail'}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function auditColumns(): DataTableColumn<AuditEvent>[] {
  return [
    {
      key: 'at',
      header: 'Time',
      width: '190px',
      cell: (event) => (
        <span className="text-muted-foreground font-mono tabular-nums">{formatTime(event.at)}</span>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      width: 'minmax(0, 1fr)',
      truncate: (event) => `${event.actor.principalId} (${event.actor.kind})`,
      cell: (event) => (
        <>
          <span className="text-foreground font-medium">{event.actor.principalId}</span>
          <span className="text-muted-foreground ml-1.5">({event.actor.kind})</span>
        </>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      width: '160px',
      cell: (event) => (
        <Badge variant="secondary" className="h-5 font-mono text-[10px]">
          {AUDIT_ACTION_LABELS[event.action]}
        </Badge>
      ),
    },
    {
      key: 'target',
      header: 'Target',
      width: 'minmax(0, 1.5fr)',
      truncate: (event) => event.target ?? '',
      cell: (event) => (
        <span className="text-muted-foreground font-mono">{event.target ?? '—'}</span>
      ),
    },
    {
      key: 'outcome',
      header: 'Outcome',
      width: '100px',
      align: 'end',
      cell: (event) => (
        <Badge
          variant="outline"
          className={cn(
            'h-5 text-[10px] font-medium capitalize',
            event.outcome === 'denied'
              ? 'border-destructive/40 text-destructive'
              : 'border-border text-muted-foreground',
          )}
        >
          {event.outcome}
        </Badge>
      ),
    },
  ];
}

function AuditSkeleton() {
  return (
    <Card className="bg-sidebar border-none p-4 shadow-none dark:ring-0" aria-hidden="true">
      <CardContent className="space-y-2.5 p-0">
        {['a', 'b', 'c', 'd', 'e'].map((key) => (
          <div key={key} className="flex items-center gap-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="ml-auto h-4 w-16" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
