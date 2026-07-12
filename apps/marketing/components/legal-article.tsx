import type React from 'react';
import { Badge } from '@/components/ui/badge';
import { Container } from '@/components/ui/container';
import { TextLink } from '@/components/ui/text-link';
import type { LegalBlock, LegalDoc } from '@/lib/legal/types';

/**
 * The legal-prose treatment (MARKETING-DESIGN §3.14, ADR-0045 v4.9) — the ONLY styling
 * surface for /legal/*. A compact quiet opening on the base ground (no shader, no
 * min-h-svh: §3.13 precedent — the document, not a hero, is the point), then a
 * single-column max-w-prose article rendered from typed LegalBlock data. Static server
 * component: no client islands, no motion seam, no mascot.
 */

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

const formatUpdated = (iso: string): string => DATE_FORMAT.format(new Date(`${iso}T00:00:00Z`));

/** Inline same-site links in paragraph/list text: `[label](/path)` (see lib/legal/types.ts). */
const INLINE_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

function renderInline(text: string): React.ReactNode {
  if (!text.includes('[')) return text;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(INLINE_LINK)) {
    const [full, label, href] = match;
    if (full === undefined || label === undefined || href === undefined) continue;
    if (match.index === undefined) continue;
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    nodes.push(
      <TextLink key={match.index} href={href}>
        {label}
      </TextLink>,
    );
    cursor = match.index + full.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

/**
 * The counsel-review placeholder (§3.14): every unresolved legal fact renders through
 * this callout — dashed hairline on the surface ground, zero accent spent — never as
 * prose that could be mistaken for a settled fact.
 */
function CounselReview({ summary, detail }: { summary: string; detail: string }) {
  return (
    <aside
      role="note"
      aria-label="Pending counsel review"
      className="border-border-strong bg-surface mt-6 rounded-lg border border-dashed p-5"
    >
      <p className="text-label text-faint-foreground uppercase">pending counsel review</p>
      <p className="text-body text-foreground mt-2 font-medium">{summary}</p>
      <p className="text-small text-muted-foreground mt-1">{detail}</p>
    </aside>
  );
}

function LegalBlockView({ block }: { block: LegalBlock }) {
  switch (block.kind) {
    case 'heading':
      // h2 is serif via the base layer on the heading size at weight 400 (§3.14 — the
      // serif never bolds); h3 stays sans on the body size.
      return block.level === 2 ? (
        <h2 id={block.id} className="text-heading text-foreground mt-12 scroll-mt-24 font-normal">
          {block.text}
        </h2>
      ) : (
        <h3 id={block.id} className="text-body text-foreground mt-8 scroll-mt-24 font-medium">
          {block.text}
        </h3>
      );
    case 'paragraph':
      return <p className="text-body text-muted-foreground mt-5">{renderInline(block.text)}</p>;
    case 'list': {
      const className = 'text-body text-muted-foreground mt-5 flex list-disc flex-col gap-2 pl-5';
      const items = block.items.map((item) => <li key={item}>{renderInline(item)}</li>);
      return block.ordered ? (
        <ol className={`${className} list-decimal`}>{items}</ol>
      ) : (
        <ul className={className}>{items}</ul>
      );
    }
    case 'table':
      return (
        <table className="mt-6 w-full border-collapse text-left">
          <caption className="text-label text-faint-foreground caption-top pb-3 text-left">
            {block.caption}
          </caption>
          <thead>
            <tr>
              {block.head.map((cell) => (
                <th
                  key={cell}
                  scope="col"
                  className="text-small text-foreground border-border-strong border-b py-2 pr-4 font-medium"
                >
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row) => (
              <tr key={row.join('·')}>
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="text-small text-muted-foreground border-b py-3 pr-4 align-top"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'counsel':
      return <CounselReview summary={block.summary} detail={block.detail} />;
  }
}

export function LegalArticle({ doc }: { doc: LegalDoc }) {
  return (
    <>
      <header className="border-b">
        <Container className="pt-32 pb-12 md:pt-36 md:pb-16">
          <p className="text-label text-faint-foreground uppercase">{doc.eyebrow}</p>
          <h1 className="text-title text-foreground mt-4 text-balance">{doc.title}</h1>
          <p className="text-lead text-muted-foreground mt-5 max-w-xl text-pretty">{doc.lead}</p>
          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Badge>draft — pending counsel review</Badge>
            <p className="text-small text-faint-foreground">
              last updated <time dateTime={doc.updated}>{formatUpdated(doc.updated)}</time>
            </p>
          </div>
        </Container>
      </header>
      <Container>
        <article className="max-w-prose pb-20 md:pb-24">
          {doc.blocks.map((block, index) => (
            <LegalBlockView key={index} block={block} />
          ))}
        </article>
      </Container>
    </>
  );
}
