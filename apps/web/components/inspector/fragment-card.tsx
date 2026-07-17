'use client';

import { ClipboardCopy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { copyToClipboard } from '@/lib/clipboard';
import { citationOf, fragmentToMarkdown } from '@/lib/export/context-package';
import type { ContextFragment } from '@/lib/api/types';

/**
 * One fragment of a compiled package, with its provenance (FR-32).
 *
 * **The heading is the citation, and the citation is a path.** This rendered `fragment.ref` — which
 * for ingested content is `sha256(sourceId:path)`, a 64-char hash — so the Inspector had F-073's
 * disease after `/search` was cured of it. The compiler already forwards the corpus metadata on
 * `provenance.source`, so the fix needed no contract change: the same `citationOf` the Markdown
 * export uses names it here, and the raw ref stays visible below.
 */
export function FragmentCard({ fragment }: { fragment: ContextFragment }) {
  const citation = citationOf(fragment);
  const hasReadableCitation = citation !== fragment.ref;

  return (
    /*
     * ONE surface per fragment (F-086). This was a bordered box inside the section Card, holding an
     * inset "Why included" box, an inset <pre>, and a bordered footer — three nesting levels, the
     * design-review "nested cards" anti-pattern, and it read boxed-in rather than composed. Now the
     * fragment is a single quiet surface; only the code body keeps its own ground (code earns one).
     */
    <div className="bg-background/30 space-y-2 rounded-lg p-3">
      <div className="flex items-start justify-between gap-3">
        <span className="text-foreground min-w-0 font-mono text-[11px] font-medium break-all">
          {citation}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant="outline" className="h-5 px-1.5 font-mono text-[9px] uppercase">
            {fragment.kind}
          </Badge>
          <Badge variant="secondary" className="h-5 px-1.5 font-mono text-[9px] tabular-nums">
            {fragment.tokens} tok
          </Badge>
          <Button
            size="icon-sm"
            variant="ghost"
            className="size-6"
            aria-label={`Copy ${citation} as Markdown`}
            // Copies the fragment's whole Markdown block — citation, why-included, provenance, then
            // the fenced body — never the bare text. Otherwise the action most likely to be used is
            // the one that throws the citation away, and "citation-preserving" means nothing.
            onClick={() =>
              void copyToClipboard(fragmentToMarkdown(fragment), 'Fragment copied as Markdown')
            }
          >
            <ClipboardCopy className="size-3" />
          </Button>
        </div>
      </div>

      <p className="text-muted-foreground text-[11px] leading-normal">
        <span className="text-foreground font-medium">Why included: </span>
        {fragment.whyIncluded}
      </p>

      {fragment.text ? (
        <pre className="text-muted-foreground bg-background/40 scrollbar-thin max-h-40 overflow-x-auto rounded-md p-2 font-mono text-[10px] whitespace-pre-wrap">
          {fragment.text}
        </pre>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        {fragment.provenance.signals.map((signal) => (
          <Badge
            key={signal}
            variant="outline"
            className="h-5 px-1.5 font-mono text-[9px] font-normal"
          >
            {signal}
          </Badge>
        ))}
        {fragment.provenance.expandedFrom ? (
          <Badge variant="outline" className="h-5 px-1.5 font-mono text-[9px] font-normal">
            ← {fragment.provenance.expandedFrom}
          </Badge>
        ) : null}
        <span className="text-muted-foreground ml-auto flex items-center gap-2 font-mono text-[10px] tabular-nums">
          {/*
            The ref is the identity a compile/fetch actually uses — kept reachable, no longer
            printed. It was a full 64-char sha256 wrapped across the card under every fragment:
            hash noise repeated N times per package (F-086). The truncated form + title carries it;
            the copy button above carries it in full inside the Markdown block.
          */}
          {/* No opacity dimming: muted-foreground is already contrast-tuned to AA, and the axe gate
              caught exactly this — a further 0.6 alpha computed 3.33:1 on the fragment surface. */}
          {hasReadableCitation ? (
            <span title={fragment.ref}>{fragment.ref.slice(0, 10)}…</span>
          ) : null}
          score {fragment.score.toFixed(3)}
        </span>
      </div>
    </div>
  );
}
