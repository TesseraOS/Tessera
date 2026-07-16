'use client';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useStats } from '@/lib/api/hooks';
import type { WorkspaceStats } from '@/lib/api/client';

/**
 * The Overview's stat cards (F-060; FR-38). Every number is read live from `GET /v1/stats` — until
 * F-060 these were a hardcoded `'—'`/`'0'` array while the API held real data (2026-07-04 review).
 *
 * **No deltas are rendered, deliberately.** `Stat.delta` stays optional and gated because nothing in
 * the system stores a prior-period snapshot: the graph has no per-node `createdAt`, and the ingestion
 * manifest holds only `path → contentHash`. A `createdAt`-derived trend would be wrong in exactly the
 * deployments that use retention (FR-15), which deletes. Honest trends need a snapshot store — that
 * is analytics (FR-47), not this card. So we show what we can prove and nothing else.
 */

type Stat = {
  label: string;
  value: string;
  /** Percent change vs the prior period. Rendered only when real data is available — see above. */
  delta?: number;
  footnote: string;
};

/** The card labels + footnotes, in display order. Values come from the API. */
const CARDS: readonly { label: string; footnote: string; of: (s: WorkspaceStats) => number }[] = [
  {
    label: 'Indexed documents',
    footnote: 'Connect a source to begin',
    of: (s) => s.documents,
  },
  {
    label: 'Active memories',
    footnote: 'Decisions, lessons, incidents',
    of: (s) => s.memories,
  },
  { label: 'Effect-links', footnote: 'Knowledge-graph edges', of: (s) => s.graph.effectLinks },
  {
    label: 'Connected sources',
    footnote: 'Filesystem & Git connectors',
    of: (s) => s.sources,
  },
];

/** Render a number the way a workspace count should read: grouped, never rounded away. */
function formatCount(value: number): string {
  return value.toLocaleString();
}

export function DashboardStats() {
  const { data, isPending, isError } = useStats();

  const stats: readonly Stat[] = CARDS.map((card) => ({
    label: card.label,
    // An unknown number is '—', never 0: "we could not load this" and "you have none" are different
    // facts, and showing the second when we mean the first is exactly the dishonesty F-060 fixes.
    value: data === undefined ? '—' : formatCount(card.of(data)),
    footnote: card.footnote,
  }));

  return (
    <>
      {stats.map((s) => (
        <Card
          className="bg-sidebar flex flex-col gap-4 border-none p-4 shadow-none dark:ring-0"
          key={s.label}
        >
          <span className="text-muted-foreground text-xs leading-none font-normal">{s.label}</span>
          {isPending ? (
            <Skeleton className="h-6 w-16" data-testid="stat-skeleton" />
          ) : (
            <span className="text-2xl leading-none font-semibold tabular-nums">{s.value}</span>
          )}
          <div className="flex items-center gap-1.5 text-xs leading-none">
            <span className="text-muted-foreground">
              {isError ? 'Unavailable — retrying' : s.footnote}
            </span>
          </div>
        </Card>
      ))}
    </>
  );
}
