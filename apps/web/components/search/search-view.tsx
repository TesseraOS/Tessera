'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { SignalBadge } from '@/components/provenance/signal-badge';
import { useSearch } from '@/lib/api/hooks';
import { useDebouncedValue } from '@/lib/use-debounced-value';

/** Global search (FR-41) — provenance-first: every result shows the signals that surfaced it. */
export function SearchView() {
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 250);
  const { data, isFetching, isError, error, refetch } = useSearch(debounced);

  const results = data?.results ?? [];
  const hasQuery = debounced.trim().length > 0;

  return (
    <div className="space-y-6">
      <div className="relative max-w-2xl">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search code, memory, and the knowledge graph…"
          className="pl-9"
          aria-label="Search query"
        />
      </div>

      {!hasQuery ? (
        <EmptyState
          icon={Search}
          title="Search across everything"
          description="Find code, memories, and graph nodes. Every result shows the signals that surfaced it."
        />
      ) : isError ? (
        <ErrorState
          title="Search failed"
          description={error instanceof Error ? error.message : 'Unknown error'}
          onRetry={() => void refetch()}
        />
      ) : isFetching && results.length === 0 ? (
        <SearchSkeleton />
      ) : results.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No results"
          description={`Nothing matched “${debounced}”.`}
        />
      ) : (
        <ul className="space-y-2" aria-busy={isFetching}>
          {results.map((result) => (
            <li key={result.ref}>
              <Card>
                <CardContent className="flex flex-col gap-2 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-mono text-sm break-all">
                      {result.label ?? result.ref}
                    </span>
                    <Badge variant="secondary" className="shrink-0 tabular-nums">
                      {result.score.toFixed(3)}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {result.signals.map((signal) => (
                      <SignalBadge key={signal.signal} signal={signal} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SearchSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {['a', 'b', 'c', 'd'].map((key) => (
        <Card key={key}>
          <CardContent className="space-y-2 py-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
