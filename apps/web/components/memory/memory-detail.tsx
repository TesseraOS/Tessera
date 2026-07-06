'use client';

import { GitCommitVertical, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/error-state';
import { cn } from '@/lib/utils';
import { useMemoryHistory } from '@/lib/api/hooks';
import { MEMORY_KIND_LABELS, formatTimestamp } from '@/lib/memory';
import type { Memory } from '@/lib/api/types';

/**
 * Memory detail (FR-45) — the current version of a lineage plus its **immutable version history**
 * (the supersede chain, FR-12) rendered oldest→newest. The current version is the head
 * (`supersededBy === null`); prior versions are never mutated, only superseded.
 */
export function MemoryDetail({
  lineageId,
  onOpenChange,
  onEdit,
}: {
  lineageId: string | null;
  onOpenChange: (open: boolean) => void;
  onEdit?: (memory: Memory) => void;
}) {
  const open = lineageId !== null;
  const { data, isPending, isError, error, refetch } = useMemoryHistory(lineageId ?? '', open);
  const versions = data?.versions ?? [];
  const current = versions[versions.length - 1];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-xl">
        {open && isError ? (
          <div className="p-4">
            <ErrorState
              title="Could not load this memory"
              description={error instanceof Error ? error.message : 'Unknown error'}
              onRetry={() => void refetch()}
            />
          </div>
        ) : open && isPending ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : current ? (
          <>
            <SheetHeader className="gap-2 border-b">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="h-5 text-[10px] capitalize">
                  {MEMORY_KIND_LABELS[current.kind]}
                </Badge>
                <span className="text-muted-foreground font-mono text-[11px]">
                  v{current.version} · {current.scope}
                </span>
                {onEdit ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto h-7 gap-1.5"
                    onClick={() => onEdit(current)}
                  >
                    <Pencil className="size-3.5" aria-hidden="true" />
                    Edit
                  </Button>
                ) : null}
              </div>
              <SheetTitle className="text-base leading-snug">{current.title}</SheetTitle>
              <SheetDescription className="text-[11px]">
                Updated {formatTimestamp(current.createdAt)} · confidence{' '}
                {current.confidence.toFixed(2)}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-5 p-4">
              <section aria-label="Memory body">
                <p className="text-foreground/90 text-sm leading-relaxed whitespace-pre-wrap">
                  {current.body}
                </p>
              </section>

              <MetadataBlock memory={current} />

              <section aria-label="Version history" className="space-y-2">
                <h3 className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                  Version history
                </h3>
                <ol className="space-y-0">
                  {[...versions].reverse().map((version, index) => {
                    const isHead = index === 0;
                    return (
                      <li key={version.id} className="flex gap-2.5">
                        <div className="flex flex-col items-center">
                          <GitCommitVertical
                            className={cn(
                              'size-4 shrink-0',
                              isHead ? 'text-primary' : 'text-muted-foreground',
                            )}
                            aria-hidden="true"
                          />
                          {index < versions.length - 1 ? (
                            <span className="bg-border w-px flex-1" aria-hidden="true" />
                          ) : null}
                        </div>
                        <div className="min-w-0 pb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-foreground font-mono text-xs">
                              v{version.version}
                            </span>
                            {isHead ? (
                              <Badge
                                variant="outline"
                                className="border-primary/40 text-primary h-4 text-[10px]"
                              >
                                current
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-foreground/80 mt-0.5 line-clamp-1 text-xs">
                            {version.title}
                          </p>
                          <p className="text-muted-foreground text-[11px]">
                            {formatTimestamp(version.createdAt)}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function MetadataBlock({ memory }: { memory: Memory }) {
  const { source, author, tags, links } = memory.metadata;
  const hasAny =
    source !== undefined ||
    author !== undefined ||
    (tags && tags.length > 0) ||
    (links && links.length > 0);
  if (!hasAny) return null;

  return (
    <section aria-label="Metadata" className="space-y-2 border-t pt-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        {source ? (
          <>
            <dt className="text-muted-foreground">Source</dt>
            <dd className="text-foreground font-mono break-all">{source}</dd>
          </>
        ) : null}
        {author ? (
          <>
            <dt className="text-muted-foreground">Author</dt>
            <dd className="text-foreground">{author}</dd>
          </>
        ) : null}
      </dl>
      {tags && tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="h-5 text-[10px]">
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}
    </section>
  );
}
