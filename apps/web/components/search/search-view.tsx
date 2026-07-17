'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { SignalField } from '@/components/art';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { ResultCard, RESULT_KINDS, kindOf, type ResultKind } from '@/components/search/result-card';
import { SearchDetail } from '@/components/search/search-detail';
import { useSearch } from '@/lib/api/hooks';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import type { FusedCandidate } from '@/lib/api/types';

const LISTBOX_ID = 'search-results';
const optionId = (index: number) => `${LISTBOX_ID}-option-${index}`;

/**
 * Global search (FR-41/FR-49) — provenance-first, and an investigation surface rather than a list.
 * Every result carries a readable label, a query-relevant excerpt with the matched terms marked, and
 * the signals that surfaced it; selecting one opens a detail Sheet that wires search → compile →
 * effects.
 */
export function SearchView() {
  const [query, setQuery] = useState('');
  const [kinds, setKinds] = useState<ResultKind[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selected, setSelected] = useState<FusedCandidate | null>(null);

  const debounced = useDebouncedValue(query, 250);
  const { data, isFetching, isError, error, refetch } = useSearch(debounced);

  const results = useMemo(() => data?.results ?? [], [data]);
  const hasQuery = debounced.trim().length > 0;
  // Whether the listbox is actually on the page. An ARIA reference to an element that does not
  // exist is a critical violation, not a harmless no-op — the same rule that governs
  // `aria-activedescendant` below. The list is absent for an empty query, an error, or no results.
  const listboxRendered = hasQuery && !isError && results.length > 0;

  /**
   * Counts are **within the current results**, never corpus-wide. The API returns one fused, ranked
   * set truncated to `limit`; it does not report how many files exist. Labelling these "8 files"
   * unqualified would be a number we cannot stand behind, so the copy scopes it to these results.
   */
  const counts = useMemo(() => {
    const tally = { file: 0, memory: 0, symbol: 0 } satisfies Record<ResultKind, number>;
    for (const result of results) tally[kindOf(result)] += 1;
    return tally;
  }, [results]);

  const filtered = useMemo(
    () => (kinds.length === 0 ? results : results.filter((r) => kinds.includes(kindOf(r)))),
    [results, kinds],
  );

  // A new result set invalidates the cursor — never leave it pointing past the end.
  useEffect(() => setActiveIndex(0), [debounced, kinds]);

  return (
    <div className="space-y-4">
      <Card className="bg-sidebar border-none p-4 shadow-none dark:ring-0">
        <CardHeader className="p-0 pb-3">
          <CardTitle>Workspace search</CardTitle>
          <CardDescription>
            Query files, symbols, and memories across your workspace knowledge graph.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-0 pt-4">
          <div className="relative w-full">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search code, memory, and the knowledge graph…"
              className="h-9 pl-9"
              aria-label="Search query"
              {...(listboxRendered && filtered.length > 0 ? { 'aria-controls': LISTBOX_ID } : {})}
              onKeyDown={(event) => {
                // ↓ from the input hands off to the list, so the keyboard path is continuous.
                if (event.key === 'ArrowDown' && filtered.length > 0) {
                  event.preventDefault();
                  document.getElementById(LISTBOX_ID)?.focus();
                }
              }}
            />
          </div>

          {hasQuery && results.length > 0 ? (
            <KindFilters counts={counts} value={kinds} onChange={setKinds} total={results.length} />
          ) : null}
        </CardContent>
      </Card>

      {!hasQuery ? (
        <EmptyState
          art={<SignalField />}
          title="Search across everything"
          description="Find code, memories, and graph nodes. Every result shows the signals that surfaced it."
        />
      ) : isError ? (
        <ErrorState
          mascot
          title="Search failed"
          description={error instanceof Error ? error.message : 'Unknown error'}
          onRetry={() => void refetch()}
        />
      ) : isFetching && results.length === 0 ? (
        <SearchSkeleton />
      ) : results.length === 0 ? (
        <EmptyState
          mascot="searching"
          title="No results"
          description={`Nothing matched “${debounced}”.`}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          mascot="searching"
          title="Nothing of that kind in these results"
          // Scoped honestly: the filter narrowed THESE results, which is not a claim about the corpus.
          description="Your query matched other kinds. Clear the filter, or try a more specific query."
        />
      ) : (
        <ResultsList
          results={filtered}
          busy={isFetching}
          activeIndex={activeIndex}
          onActiveIndexChange={setActiveIndex}
          onSelect={setSelected}
        />
      )}

      <SearchDetail
        result={selected}
        query={debounced}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        // Return the keyboard to the list it came from — a Sheet that dumps focus on `<body>` is a
        // dead end of its own, and the active index is still sitting there waiting.
        onCloseFocus={() => document.getElementById(LISTBOX_ID)?.focus()}
      />
    </div>
  );
}

function KindFilters({
  counts,
  value,
  onChange,
  total,
}: {
  counts: Record<ResultKind, number>;
  value: ResultKind[];
  onChange: (next: ResultKind[]) => void;
  total: number;
}) {
  const toggle = (kind: ResultKind) =>
    onChange(value.includes(kind) ? value.filter((k) => k !== kind) : [...value, kind]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Toggle buttons with `aria-pressed` rather than a select: the filter is multi-select, and
          each button carries its own count so the state is legible without opening anything. */}
      <div role="group" aria-label="Filter results by kind" className="flex flex-wrap gap-1.5">
        {RESULT_KINDS.map((kind) => {
          const count = counts[kind];
          const pressed = value.includes(kind);
          return (
            <Button
              key={kind}
              type="button"
              size="sm"
              variant={pressed ? 'secondary' : 'outline'}
              aria-pressed={pressed}
              disabled={count === 0}
              onClick={() => toggle(kind)}
              className="h-7 text-xs"
            >
              <span className="capitalize">{kind}</span>
              <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px] tabular-nums">
                {count}
              </Badge>
            </Button>
          );
        })}
      </div>
      <span className="text-muted-foreground text-xs">
        {total} result{total === 1 ? '' : 's'} for this query
      </span>
    </div>
  );
}

/**
 * The virtualized, keyboard-navigable results list (FR-49).
 *
 * `listbox` + `aria-activedescendant`: the list is ONE tab stop and arrows move within it, rather
 * than making a keyboard user tab through every card to reach the next control.
 */
function ResultsList({
  results,
  busy,
  activeIndex,
  onActiveIndexChange,
  onSelect,
}: {
  results: FusedCandidate[];
  busy: boolean;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onSelect: (result: FusedCandidate) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  // A listbox always HAS an active option, but showing its highlight while the list is unfocused
  // reads as "this result is selected" when nothing is — so the cue follows focus, and
  // `aria-activedescendant` (which assistive tech reads) is set regardless.
  const [focused, setFocused] = useState(false);
  const virtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 132,
    overscan: 8,
  });

  const clamped = Math.min(activeIndex, results.length - 1);

  // `aria-activedescendant` MUST reference an element that is IN THE DOM — and under virtualization
  // the active row may not be rendered. Without this scroll the visuals look fine while a screen
  // reader announces nothing at all, which is the kind of a11y bug you cannot see.
  useEffect(() => {
    if (clamped >= 0) virtualizer.scrollToIndex(clamped, { align: 'auto' });
  }, [clamped, virtualizer]);

  const move = useCallback(
    (next: number) => onActiveIndexChange(Math.max(0, Math.min(results.length - 1, next))),
    [onActiveIndexChange, results.length],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(clamped + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(clamped - 1);
        break;
      case 'Home':
        event.preventDefault();
        move(0);
        break;
      case 'End':
        event.preventDefault();
        move(results.length - 1);
        break;
      case 'Enter': {
        event.preventDefault();
        const result = results[clamped];
        if (result) onSelect(result);
        break;
      }
      default:
        break;
    }
  };

  return (
    <div
      ref={parentRef}
      id={LISTBOX_ID}
      role="listbox"
      tabIndex={0}
      aria-label="Search results"
      aria-activedescendant={clamped >= 0 ? optionId(clamped) : undefined}
      aria-busy={busy}
      onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      /*
       * `px-1`, not `pr-1` (F-082). The active row draws a 2px `ring`, which paints OUTSIDE its
       * border box — and `overflow-y: auto` forces the x-axis to clip as well, so a gutter on only
       * one side shaved the ring off the LEFT edge of every result while the right looked fine.
       * That is the "cards cut off on the left" report: the cards were never wrong, the scroll
       * container was. Both sides now clear the ring.
       */
      className="max-h-[65vh] overflow-y-auto rounded-xl px-1 outline-none"
    >
      <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((row) => {
          const result = results[row.index];
          if (!result) return null;
          return (
            <div
              key={result.ref}
              data-index={row.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full pb-2"
              style={{ transform: `translateY(${row.start}px)` }}
            >
              <ResultCard
                result={result}
                id={optionId(row.index)}
                active={focused && row.index === clamped}
                selected={row.index === clamped}
                onSelect={() => {
                  onActiveIndexChange(row.index);
                  onSelect(result);
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SearchSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {['a', 'b', 'c', 'd'].map((key) => (
        <Card className="bg-sidebar border-none p-4 shadow-none dark:ring-0" key={key}>
          <CardContent className="space-y-2.5 p-0">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
