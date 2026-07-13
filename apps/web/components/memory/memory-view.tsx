'use client';

import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { MemoryStrata } from '@/components/art';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { MemoryAuthoringDialog } from '@/components/memory/memory-authoring-dialog';
import { MemoryDetail } from '@/components/memory/memory-detail';
import { useMemories } from '@/lib/api/hooks';
import { MEMORY_KIND_ACCENT, MEMORY_KIND_LABELS, formatTimestamp } from '@/lib/memory';
import { MEMORY_KINDS, type Memory, type MemoryKind } from '@/lib/api/types';

const ALL = 'all';

/**
 * Memory browser (FR-45) — browse/filter the versioned memory subsystem by kind + scope, open a
 * lineage to read it and its full version history. Virtualized for large sets. Real data over
 * `GET /v1/memory` (ADR-0022); nothing fabricated.
 */
export function MemoryView() {
  const [kind, setKind] = useState<MemoryKind | typeof ALL>(ALL);
  const [scope, setScope] = useState<string>(ALL);
  const [selected, setSelected] = useState<string | null>(null);
  const [authoringOpen, setAuthoringOpen] = useState(false);
  const [editing, setEditing] = useState<Memory | null>(null);

  const openCapture = () => {
    setEditing(null);
    setAuthoringOpen(true);
  };
  const openEdit = (memory: Memory) => {
    setSelected(null);
    setEditing(memory);
    setAuthoringOpen(true);
  };

  const { data, isPending, isError, error, refetch, isFetching } = useMemories(
    kind === ALL ? {} : { kind },
  );
  const memories = useMemo(() => data?.memories ?? [], [data]);

  // Distinct scopes present in the current (kind-filtered) set → a scope filter with real values.
  const scopes = useMemo(
    () => Array.from(new Set(memories.map((memory) => memory.scope))).sort(),
    [memories],
  );
  const filtered = useMemo(
    () => (scope === ALL ? memories : memories.filter((memory) => memory.scope === scope)),
    [memories, scope],
  );

  return (
    <div className="space-y-4">
      <Card className="bg-sidebar border-none p-4 shadow-none dark:ring-0">
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 p-0">
          <div className="space-y-1.5">
            <CardTitle>Memory</CardTitle>
            <CardDescription>
              Browse the decisions, lessons, and incidents your agents rely on. Every memory is
              versioned — edits append a new version, never overwrite.
            </CardDescription>
          </div>
          <Button size="sm" className="shrink-0 gap-1.5" onClick={openCapture}>
            <Plus className="size-4" aria-hidden="true" />
            New memory
          </Button>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2 p-0 pt-4">
          <Select value={kind} onValueChange={(value) => setKind(value as MemoryKind)}>
            <SelectTrigger className="h-9 w-[170px]" aria-label="Filter by kind">
              <SelectValue placeholder="All kinds" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All kinds</SelectItem>
              {MEMORY_KINDS.map((value) => (
                <SelectItem key={value} value={value}>
                  {MEMORY_KIND_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger className="h-9 w-[170px]" aria-label="Filter by scope">
              <SelectValue placeholder="All scopes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All scopes</SelectItem>
              {scopes.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isError ? (
        <ErrorState
          mascot
          title="Could not load memories"
          description={error instanceof Error ? error.message : 'Is the Tessera API running?'}
          onRetry={() => void refetch()}
        />
      ) : isPending ? (
        <MemorySkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          art={memories.length === 0 ? <MemoryStrata /> : undefined}
          mascot={memories.length === 0 ? undefined : 'searching'}
          title={memories.length === 0 ? 'No memories yet' : 'No memories match these filters'}
          description={
            memories.length === 0
              ? 'Capture a decision, lesson, or incident to give your agents durable context.'
              : 'Try a different kind or scope.'
          }
          action={
            memories.length === 0 ? (
              <Button size="sm" variant="outline" className="mt-1.5 gap-1.5" onClick={openCapture}>
                <Plus className="size-4" aria-hidden="true" />
                New memory
              </Button>
            ) : undefined
          }
        />
      ) : (
        <MemoryList memories={filtered} busy={isFetching} onSelect={setSelected} />
      )}

      <MemoryDetail
        lineageId={selected}
        onOpenChange={(open) => !open && setSelected(null)}
        onEdit={openEdit}
      />
      <MemoryAuthoringDialog
        open={authoringOpen}
        onOpenChange={setAuthoringOpen}
        editing={editing}
      />
    </div>
  );
}

/** Virtualized memory list (FR-49) — renders only the visible rows for large sets. */
function MemoryList({
  memories,
  busy,
  onSelect,
}: {
  memories: Memory[];
  busy: boolean;
  onSelect: (lineageId: string) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: memories.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 84,
    overscan: 8,
  });

  return (
    <div
      ref={parentRef}
      className="max-h-[65vh] overflow-y-auto pr-1"
      aria-busy={busy}
      role="list"
      aria-label="Memories"
    >
      <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((row) => {
          const memory = memories[row.index];
          if (!memory) return null;
          return (
            <div
              key={memory.id}
              data-index={row.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full pb-2"
              style={{ transform: `translateY(${row.start}px)` }}
              role="listitem"
            >
              <MemoryCard memory={memory} onSelect={onSelect} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MemoryCard({
  memory,
  onSelect,
}: {
  memory: Memory;
  onSelect: (lineageId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(memory.lineageId)}
      className="focus-visible:ring-ring block w-full rounded-xl text-left focus-visible:ring-2 focus-visible:outline-none"
    >
      <Card className="bg-sidebar hover:bg-accent/40 border-none p-4 shadow-none transition-colors dark:ring-0">
        <CardContent className="flex items-start gap-3 p-0">
          <span
            className="mt-1 h-8 w-1 shrink-0 rounded-full"
            style={{ backgroundColor: MEMORY_KIND_ACCENT[memory.kind] }}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="h-4 text-[10px] capitalize">
                {MEMORY_KIND_LABELS[memory.kind]}
              </Badge>
              <span className="text-muted-foreground truncate font-mono text-[11px]">
                {memory.scope}
              </span>
            </div>
            <p className="text-foreground truncate text-sm font-medium">{memory.title}</p>
            <p className="text-muted-foreground truncate text-xs">
              v{memory.version} · {formatTimestamp(memory.createdAt)}
            </p>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

function MemorySkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {['a', 'b', 'c', 'd', 'e'].map((key) => (
        <Card key={key} className="bg-sidebar border-none p-4 shadow-none dark:ring-0">
          <CardContent className="flex items-start gap-3 p-0">
            <Skeleton className="h-8 w-1 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
