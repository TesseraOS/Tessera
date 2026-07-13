'use client';

import { useMemo, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LedgerGate } from '@/components/art';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { cn } from '@/lib/utils';
import { useAudit } from '@/lib/api/hooks';
import type { AuditAction, AuditOutcome, AuditQuery } from '@/lib/api/types';
import { AUDIT_ACTION_LABELS, AUDIT_ACTIONS, AUDIT_OUTCOMES } from '@/lib/governance';

const ALL = 'all';

/** Format an ISO timestamp for the table (client-only render → no SSR hydration mismatch). */
function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/**
 * Audit log (FR-48/55) — a filterable, provenance-first table of sensitive actions: who did what, to
 * what, with what outcome, when. Reads `GET /v1/audit` (admin-only, tenant-scoped).
 */
export function AuditView() {
  const [action, setAction] = useState<AuditAction | typeof ALL>(ALL);
  const [outcome, setOutcome] = useState<AuditOutcome | typeof ALL>(ALL);

  const query = useMemo<AuditQuery>(
    () => ({
      ...(action !== ALL ? { action } : {}),
      ...(outcome !== ALL ? { outcome } : {}),
    }),
    [action, outcome],
  );

  const { data, isPending, isError, error, refetch, isFetching } = useAudit(query);
  const events = data?.events ?? [];

  return (
    <div className="space-y-4">
      <Card className="bg-sidebar border-none p-4 shadow-none dark:ring-0">
        <CardHeader className="p-0 pb-3">
          <CardTitle>Audit log</CardTitle>
          <CardDescription>
            Every sensitive action across this workspace — access, writes, and admin — recorded
            immutably for compliance.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2 p-0 pt-4">
          <Select value={action} onValueChange={(value) => setAction(value as AuditAction)}>
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
          <Select value={outcome} onValueChange={(value) => setOutcome(value as AuditOutcome)}>
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
          description="Nothing matches these filters yet. Sensitive actions appear here as they happen."
        />
      ) : (
        <Card className="bg-sidebar border-none p-0 shadow-none dark:ring-0">
          <CardContent className="p-0" aria-busy={isFetching}>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[190px]">Time</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead className="text-right">Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="text-muted-foreground font-mono text-xs tabular-nums">
                      {formatTime(event.at)}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="text-foreground font-medium">{event.actor.principalId}</span>
                      <span className="text-muted-foreground ml-1.5">({event.actor.kind})</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="h-5 font-mono text-[10px]">
                        {AUDIT_ACTION_LABELS[event.action]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[220px] truncate font-mono text-xs">
                      {event.target ?? '—'}
                    </TableCell>
                    <TableCell className="text-right">
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {data?.nextCursor ? (
        <p className="text-muted-foreground flex items-center gap-1.5 px-1 text-xs">
          <ShieldAlert className="size-3.5" aria-hidden="true" />
          More events match — narrow the filters to see older entries.
        </p>
      ) : null}
    </div>
  );
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
