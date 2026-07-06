'use client';

import { useState } from 'react';
import {
  AlertCircle,
  Boxes,
  CheckCircle2,
  Clock,
  Cloud,
  Folder,
  FolderGit2,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { RegisterSourceDialog } from '@/components/sources/register-source-dialog';
import { cn } from '@/lib/utils';
import { TesseraApiError } from '@/lib/api/client';
import { useRemoveSource, useScanSource, useScanStatus, useSources } from '@/lib/api/hooks';
import { useScanEvents, type SourceScanProgress } from '@/lib/api/events';
import type { ScanSummary, Source } from '@/lib/api/types';

const KIND_ICON: Record<string, typeof Folder> = {
  filesystem: Folder,
  git: FolderGit2,
  github: Cloud,
};

/** Client-only timestamp render (avoids SSR hydration mismatch; data resolves after mount). */
function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/**
 * Sources (FR-46/FR-62) — register + scan filesystem/git repositories through the ingestion
 * pipeline, with live scan progress over the `/v1/events` SSE stream. Every row is real data from
 * `GET /v1/sources`; nothing is fabricated (ADR-0022).
 */
export function SourcesView() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data, isPending, isError, error, refetch, isFetching } = useSources();
  const scanEvents = useScanEvents();
  const sources = data?.sources ?? [];

  return (
    <div className="space-y-4">
      <Card className="bg-sidebar border-none p-4 shadow-none dark:ring-0">
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 p-0">
          <div className="space-y-1.5">
            <CardTitle>Sources</CardTitle>
            <CardDescription>
              Connect filesystem and Git repositories for Tessera to index. Scans are incremental
              and idempotent — only what changed is re-processed.
            </CardDescription>
          </div>
          <Button size="sm" className="shrink-0 gap-1.5" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Register source
          </Button>
        </CardHeader>
      </Card>

      {isError ? (
        <ErrorState
          title="Could not load sources"
          description={error instanceof Error ? error.message : 'Is the Tessera API running?'}
          onRetry={() => void refetch()}
        />
      ) : isPending ? (
        <SourcesSkeleton />
      ) : sources.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No sources yet"
          description="Register a filesystem or Git repository to start indexing your workspace."
          action={
            <Button
              size="sm"
              variant="outline"
              className="mt-1.5 gap-1.5"
              onClick={() => setDialogOpen(true)}
            >
              <Plus className="size-4" aria-hidden="true" />
              Register source
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2" aria-busy={isFetching}>
          {sources.map((source) => (
            <li key={source.id}>
              <SourceRow source={source} progress={scanEvents.bySource[source.id]} />
            </li>
          ))}
        </ul>
      )}

      <RegisterSourceDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

function SourceRow({
  source,
  progress,
}: {
  source: Source;
  progress?: SourceScanProgress | undefined;
}) {
  const [removeOpen, setRemoveOpen] = useState(false);
  const { data: status } = useScanStatus(source.id);
  const scan = useScanSource();
  const remove = useRemoveSource();

  const Icon = KIND_ICON[source.kind] ?? Boxes;
  const root = typeof source.config['root'] === 'string' ? (source.config['root'] as string) : '—';

  const running = Boolean(progress?.running) || scan.isPending || status?.state === 'running';
  const lastSummary = progress?.lastSummary ?? status?.lastScan?.summary;
  const lastAt = progress?.at ?? status?.lastScan?.at;
  const hasError = !running && (status?.state === 'error' || Boolean(status?.error));

  const triggerScan = () => {
    scan.mutate(source.id, {
      onSuccess: (result) =>
        toast.success('Scan complete', { description: summaryLine(result.summary) }),
      onError: (error) =>
        toast.error('Scan failed', {
          description:
            error instanceof TesseraApiError ? error.message : 'Is the Tessera API running?',
        }),
    });
  };

  const triggerRemove = () => {
    remove.mutate(source.id, {
      onSuccess: () => {
        toast.success('Source removed', { description: source.label });
        setRemoveOpen(false);
      },
      onError: (error) =>
        toast.error('Could not remove source', {
          description:
            error instanceof TesseraApiError ? error.message : 'Is the Tessera API running?',
        }),
    });
  };

  return (
    <Card className="bg-sidebar border-none p-4 shadow-none dark:ring-0">
      <CardContent className="flex flex-col gap-3 p-0 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="bg-muted/50 text-muted-foreground mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4">
            <Icon aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-foreground truncate text-sm font-medium">{source.label}</span>
              <Badge variant="secondary" className="h-4 shrink-0 font-mono text-[10px] capitalize">
                {source.kind}
              </Badge>
            </div>
            <p className="text-muted-foreground truncate font-mono text-xs" title={root}>
              {root}
            </p>
            <ScanStatusLine
              running={running}
              ingested={progress?.ingested ?? 0}
              summary={lastSummary}
              at={lastAt}
              hasError={hasError}
              errorText={status?.error}
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            onClick={triggerScan}
            disabled={running}
          >
            <RefreshCw className={cn('size-3.5', running && 'animate-spin')} aria-hidden="true" />
            {running ? 'Scanning…' : 'Scan'}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive size-8"
            onClick={() => setRemoveOpen(true)}
            aria-label={`Remove ${source.label}`}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </CardContent>

      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove source?</DialogTitle>
            <DialogDescription>
              <span className="text-foreground font-medium">{source.label}</span> and its indexed
              documents will be removed from the workspace. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setRemoveOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={triggerRemove}
              disabled={remove.isPending}
            >
              {remove.isPending ? 'Removing…' : 'Remove source'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ScanStatusLine({
  running,
  ingested,
  summary,
  at,
  hasError,
  errorText,
}: {
  running: boolean;
  ingested: number;
  summary?: ScanSummary | undefined;
  at?: string | undefined;
  hasError: boolean;
  errorText?: string | undefined;
}) {
  if (running) {
    return (
      <span className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
        <Loader2 className="text-primary size-3 animate-spin" aria-hidden="true" />
        Scanning…{ingested > 0 ? ` ${ingested} indexed` : ''}
      </span>
    );
  }
  if (hasError) {
    return (
      <span className="text-destructive flex items-center gap-1.5 text-[11px]">
        <AlertCircle className="size-3" aria-hidden="true" />
        {errorText ?? 'Last scan failed'}
      </span>
    );
  }
  if (summary) {
    return (
      <span className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px]">
        <CheckCircle2
          className="size-3 text-emerald-600 dark:text-emerald-500"
          aria-hidden="true"
        />
        <span className="tabular-nums">{summaryLine(summary)}</span>
        {at ? (
          <span className="text-muted-foreground inline-flex items-center gap-1">
            <span aria-hidden="true">·</span>
            <Clock className="size-3" aria-hidden="true" />
            {formatTime(at)}
          </span>
        ) : null}
      </span>
    );
  }
  return <span className="text-muted-foreground text-[11px]">Not scanned yet</span>;
}

function summaryLine(summary: ScanSummary): string {
  return `${summary.added} added · ${summary.modified} modified · ${summary.removed} removed · ${summary.unchanged} unchanged`;
}

function SourcesSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {['a', 'b', 'c'].map((key) => (
        <Card key={key} className="bg-sidebar border-none p-4 shadow-none dark:ring-0">
          <CardContent className="flex items-center gap-3 p-0">
            <Skeleton className="size-9 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="h-8 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
