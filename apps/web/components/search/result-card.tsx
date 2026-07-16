'use client';

import { forwardRef } from 'react';
import { BookText, FileCode, Network } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { SignalBadge } from '@/components/provenance/signal-badge';
import { Snippet } from '@/components/search/snippet';
import type { FusedCandidate } from '@/lib/api/types';

/** The three kinds a hit can be — the API derives these; the UI only names them. */
export const RESULT_KINDS = ['file', 'memory', 'symbol'] as const;
export type ResultKind = (typeof RESULT_KINDS)[number];

const KIND_META: Record<ResultKind, { icon: typeof FileCode; label: string }> = {
  file: { icon: FileCode, label: 'File' },
  memory: { icon: BookText, label: 'Memory' },
  symbol: { icon: Network, label: 'Symbol' },
};

export function kindOf(result: FusedCandidate): ResultKind {
  const kind = result.kind;
  return (RESULT_KINDS as readonly string[]).includes(kind ?? '') ? (kind as ResultKind) : 'symbol';
}

/**
 * Read a result's title. Before F-061/F-073 this fell back to the `ref` — a 64-char content hash —
 * which is why a result list was a dead end. The API now labels every hit; the fallback survives
 * only for a hit whose corpus fragment carries no path (nothing to name it with), and says so
 * plainly rather than printing a hash at a person.
 */
export function titleOf(result: FusedCandidate): string {
  return result.label ?? 'Untitled fragment';
}

/**
 * One search hit (F-061): what it is, what matched, and why it ranked — the provenance is on the
 * card, not only in a hover tooltip, so two results can be compared without a mouse.
 *
 * Rendered as an `option` inside the results `listbox`: the whole list is one tab stop and arrow
 * keys move between hits, so a keyboard user is not tabbing through N cards to reach the last one.
 */
export const ResultCard = forwardRef<
  HTMLDivElement,
  {
    result: FusedCandidate;
    active: boolean;
    selected: boolean;
    id: string;
    onSelect: () => void;
  }
>(function ResultCard({ result, active, selected, id, onSelect }, ref) {
  const kind = kindOf(result);
  const { icon: Icon, label: kindLabel } = KIND_META[kind];

  return (
    <Card
      ref={ref}
      id={id}
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        'bg-sidebar cursor-pointer border-none p-4 shadow-none transition-colors dark:ring-0',
        // The active row is styled from `active`, not `:focus` — focus stays on the listbox so
        // `aria-activedescendant` can do the announcing (a roving tabindex would fight it).
        // `dark:ring-2` is load-bearing, not redundant: the base class above sets `dark:ring-0`,
        // and a dark-variant utility beats the unprefixed `ring-2` — so without it the active row
        // is invisible in all four dark themes while looking correct in light. A screenshot caught
        // this; no test would have, because the a11y state was right the whole time.
        active && 'ring-ring bg-accent/40 ring-2 dark:ring-2',
      )}
    >
      <CardContent className="flex flex-col gap-2.5 p-0">
        <div className="flex items-start justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            <Icon className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate font-mono text-xs font-medium">{titleOf(result)}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <Badge variant="outline" className="h-5 text-[10px] font-normal">
              {kindLabel}
            </Badge>
            <Badge variant="secondary" className="h-5 font-mono text-[10px] tabular-nums">
              {result.score.toFixed(3)}
            </Badge>
          </span>
        </div>

        {result.snippet ? <Snippet snippet={result.snippet} /> : null}

        <div className="flex flex-wrap gap-1.5">
          {result.signals.map((signal) => (
            <SignalBadge key={signal.signal} signal={signal} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
});
