'use client';

import { ArrowRight, GitBranch, Loader2 } from 'lucide-react';
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
import { Snippet } from '@/components/search/snippet';
import { kindOf, titleOf } from '@/components/search/result-card';
import { useEffects, useMemoryHistory } from '@/lib/api/hooks';
import {
  NODE_KINDS,
  type CandidateNode,
  type FusedCandidate,
  type NodeKind,
} from '@/lib/api/types';

/**
 * Search result detail (F-061) — the surface that stops a result being a dead end.
 *
 * **A Sheet, not a `/search/[ref]` route, and that is a correctness call rather than a taste one.**
 * Provenance only exists *relative to a query*: `rank`, `score`, `weight` and `contribution` are
 * properties of this hit **in this search**, so a standalone route would have to re-run the search on
 * a hard load just to reconstruct them — and would still be wrong if the corpus had moved. A ref is
 * not a stable resource. The Sheet also keeps the list, its scroll position, the virtualizer's window
 * and the active index alive behind it, which is what makes ↓ ↓ Enter Esc ↓ Enter work; a navigation
 * destroys all four. Radix gives the focus trap, Escape and focus restoration for free.
 */
export function SearchDetail({
  result,
  query,
  onOpenChange,
  onCloseFocus,
}: {
  result: FusedCandidate | null;
  query: string;
  onOpenChange: (open: boolean) => void;
  /** Where the keyboard goes when the Sheet closes. See `onCloseAutoFocus` below. */
  onCloseFocus?: () => void;
}) {
  const open = result !== null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto sm:max-w-xl"
        onCloseAutoFocus={(event) => {
          // This Sheet is CONTROLLED — it has no `SheetTrigger`, because it opens from Enter on the
          // results listbox. So Radix has no trigger to restore focus to and drops it on `<body>`:
          // a keyboard user who opens a result and escapes silently loses their place in the list.
          // Preventing the default and directing focus ourselves is the fix; doing it in
          // `onOpenChange` does not work, as Radix's own restoration runs afterwards and wins.
          if (onCloseFocus) {
            event.preventDefault();
            onCloseFocus();
          }
        }}
      >
        {result ? <SearchDetailBody result={result} query={query} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function SearchDetailBody({ result, query }: { result: FusedCandidate; query: string }) {
  const kind = kindOf(result);
  const title = titleOf(result);

  // The compile task IS the retrieval query, so a seed of "a3f8b2c9…" would feed a hash into FTS and
  // embeddings. Seeding with the label is only meaningful because the API now supplies a real one.
  const seed = result.label === undefined ? query : `${query} — ${result.label}`;

  return (
    <>
      <SheetHeader className="gap-2 border-b">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="h-5 text-[10px] capitalize">
            {kind}
          </Badge>
          <Badge variant="secondary" className="h-5 font-mono text-[10px] tabular-nums">
            {result.score.toFixed(3)}
          </Badge>
        </div>
        <SheetTitle className="font-mono text-sm break-all">{title}</SheetTitle>
        <SheetDescription className="sr-only">
          Result detail with provenance and actions
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-5 p-4">
        {result.snippet ? (
          <section className="space-y-1.5">
            <h3 className="text-xs font-semibold">Matched excerpt</h3>
            <div className="bg-muted/40 rounded-lg p-3">
              <Snippet snippet={result.snippet} />
            </div>
          </section>
        ) : null}

        <ProvenanceTable result={result} />

        {kind === 'memory' ? <MemoryBody result={result} /> : null}

        <section className="space-y-1.5">
          <h3 className="text-xs font-semibold">Actions</h3>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              {/* Prefill only — compile spends budget and is entitlement-clamped, so it must never
                  fire from a navigation. The user presses Compile. */}
              <a href={`/inspector?task=${encodeURIComponent(seed)}`}>
                Open in Inspector
                <ArrowRight className="size-4" />
              </a>
            </Button>
          </div>
        </section>

        {/* Absent, never disabled-with-a-lie: a memory has no graph node, and neither does a hit
            whose fragment carries no path. Offering an action that cannot work is worse than not
            offering it. Symbol results would need {kind,key} carried through fusion — deferred. */}
        {result.node ? <EffectsSection node={result.node} /> : null}

        <section className="space-y-1.5">
          <h3 className="text-xs font-semibold">Reference</h3>
          <p className="text-muted-foreground font-mono text-[10px] break-all">{result.ref}</p>
        </section>
      </div>
    </>
  );
}

/**
 * Per-signal rank/score/weight/contribution, **expanded and persistent**. The same data is in
 * `SignalBadge`'s tooltip, but hover-only provenance is invisible on touch and impossible to compare
 * across results — and provenance is this product's whole claim, so it should not require a mouse.
 */
function ProvenanceTable({ result }: { result: FusedCandidate }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-semibold">Why this ranked</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground border-b text-left">
              <th className="py-1.5 pr-3 font-normal">Signal</th>
              <th className="py-1.5 pr-3 text-right font-normal">Rank</th>
              <th className="py-1.5 pr-3 text-right font-normal">Score</th>
              <th className="py-1.5 pr-3 text-right font-normal">Weight</th>
              <th className="py-1.5 text-right font-normal">Contribution</th>
            </tr>
          </thead>
          <tbody>
            {result.signals.map((signal) => (
              <tr key={signal.signal} className="border-border/60 border-b last:border-0">
                <td className="py-1.5 pr-3 capitalize">{signal.signal}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{signal.rank}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{signal.score.toFixed(3)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{signal.weight.toFixed(2)}</td>
                <td className="py-1.5 text-right tabular-nums">{signal.contribution.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground text-[10px]">
        Fused by weighted reciprocal-rank fusion; the total is the sum of contributions.
      </p>
    </section>
  );
}

/** A memory's full body, via the existing tenant-scoped `/v1/memory/:lineageId/history`. */
function MemoryBody({ result }: { result: FusedCandidate }) {
  const lineageId = result.ref.startsWith('memory/') ? result.ref.slice('memory/'.length) : null;
  const { data, isPending } = useMemoryHistory(lineageId ?? '', lineageId !== null);
  const current = data?.versions?.[data.versions.length - 1];

  if (lineageId === null) return null;
  if (isPending) return <Skeleton className="h-20 w-full" />;
  if (!current) return null;

  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-semibold">Memory</h3>
      <p className="text-muted-foreground text-xs leading-relaxed whitespace-pre-wrap">
        {current.body}
      </p>
    </section>
  );
}

/**
 * Ranked dependents, rendered **inline**. Deep-linking to `/graph` was rejected on evidence: the
 * graph view holds all state locally with no URL params and loads at most 500 nodes, so a link to a
 * node outside that window resolves to nothing at all. Keeping effects here also keeps the user in
 * one investigation flow, which is what search → compile → effects is supposed to be.
 */
function EffectsSection({ node }: { node: CandidateNode }) {
  // The wire types `node.kind` as an open string (the API derives it), while `EffectsQuery` takes the
  // closed NodeKind union. Narrow at the boundary rather than casting: a kind this client does not
  // know about must skip the query, not be forced through it and 400 at the server.
  const query = (NODE_KINDS as readonly string[]).includes(node.kind)
    ? { kind: node.kind as NodeKind, key: node.key }
    : null;
  const { data, isPending, isError } = useEffects(query);
  const effects = data?.effects ?? [];

  if (query === null) return null;

  return (
    <section className="space-y-1.5">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold">
        <GitBranch className="size-3.5" aria-hidden="true" />
        What a change here affects
      </h3>
      {isPending ? (
        <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          Tracing effect-links…
        </span>
      ) : isError ? (
        <p className="text-muted-foreground text-xs">Could not load effect-links.</p>
      ) : effects.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          Nothing depends on this yet — no effect-links point here.
        </p>
      ) : (
        <ul className="space-y-1">
          {effects.map((hit) => (
            <li key={hit.node.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-mono">{hit.node.label}</span>
              <span className="text-muted-foreground shrink-0 tabular-nums">
                {hit.distance} hop{hit.distance === 1 ? '' : 's'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
