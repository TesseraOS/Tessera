'use client';

import { Fragment } from 'react';
import type { Snippet as SnippetData } from '@/lib/api/types';

/**
 * Render a search excerpt with its matched terms highlighted (F-061).
 *
 * **The API sends offsets, not markup, and this is where that pays off.** The excerpt is content
 * ingested from a scanned repository — anyone who can land a file in it can influence this string.
 * Rendering server-supplied HTML here (`dangerouslySetInnerHTML`) would be the classic
 * search-snippet XSS. Instead we slice the plain string by offset and emit `<mark>` **React
 * elements**: React escapes every slice, so a snippet containing `<script>` renders as the visible
 * text `<script>`. There is no markup to inject and no sanitizer to misconfigure — the injection is
 * structurally impossible rather than filtered.
 *
 * The offsets come from the same tokenizer the keyword retriever matched with, so a highlight marks
 * exactly what contributed to the hit, not a client-side guess at it.
 */
export function Snippet({ snippet }: { snippet: SnippetData }) {
  const { text, matches, truncatedStart, truncatedEnd } = snippet;

  // Defensive: ignore any span that does not index this string. A malformed offset must degrade to
  // plain text, never throw a slice error into the results list or silently drop the excerpt.
  const spans = matches
    .filter((m) => m.start >= 0 && m.end <= text.length && m.end > m.start)
    .sort((a, b) => a.start - b.start);

  const parts: { text: string; highlighted: boolean }[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) continue; // overlapping — keep the first, drop the rest
    if (span.start > cursor)
      parts.push({ text: text.slice(cursor, span.start), highlighted: false });
    parts.push({ text: text.slice(span.start, span.end), highlighted: true });
    cursor = span.end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), highlighted: false });

  return (
    <p className="text-muted-foreground text-xs leading-relaxed">
      {truncatedStart ? '…' : null}
      {parts.map((part, index) => (
        <Fragment key={index}>
          {part.highlighted ? (
            <mark className="bg-primary/15 text-foreground rounded-[2px] px-0.5 font-medium">
              {part.text}
            </mark>
          ) : (
            part.text
          )}
        </Fragment>
      ))}
      {truncatedEnd ? '…' : null}
    </p>
  );
}
