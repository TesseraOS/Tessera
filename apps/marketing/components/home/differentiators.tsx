import type React from 'react';
import { CompilePanel } from '@/components/home/compile-panel';
import { EffectGraph } from '@/components/home/effect-graph';
import { Container } from '@/components/ui/container';
import { SectionHeading } from '@/components/ui/section-heading';
import { Reveal } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * The three differentiators (F-051 acceptance): Context Compiler, effect-links,
 * governance — asymmetric rows whose visuals are LIVING product panels (§3.5): the
 * compile trace fills, the graph draws its edges, the audit rows settle.
 */

const AUDIT_ROWS = [
  { action: 'context.compile', actor: 'claude-code', outcome: 'success' },
  { action: 'memory.write', actor: 'writer-1', outcome: 'success' },
  { action: 'source.scan', actor: 'reader-1', outcome: 'denied' },
] as const;

function AuditVisual() {
  return (
    <div
      role="img"
      aria-label="Audit trail rows: context.compile by claude-code succeeded, memory.write by writer-1 succeeded, source.scan by reader-1 was denied"
      data-band="dusk"
      className="bg-card overflow-hidden rounded-lg border"
    >
      <div aria-hidden="true">
        <div className="flex h-10 items-center justify-between border-b px-4">
          <span className="text-label text-muted-foreground font-mono">audit · /v1/audit</span>
          <span className="text-label text-faint-foreground font-mono">tenant: default</span>
        </div>
        <ul className="divide-border divide-y">
          {AUDIT_ROWS.map((row, index) => (
            <li key={row.action}>
              <Reveal
                delay={index * 90}
                className="flex items-baseline justify-between gap-4 px-4 py-3.5"
              >
                <span className="text-label text-foreground font-mono">{row.action}</span>
                <span className="text-label text-muted-foreground hidden font-mono sm:inline">
                  {row.actor}
                </span>
                <span
                  className={cn(
                    'text-label font-mono',
                    row.outcome === 'denied' ? 'text-rose' : 'text-faint-foreground',
                  )}
                >
                  {row.outcome}
                </span>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const ROWS: Array<{
  title: React.ReactNode;
  body: string;
  caption: string;
  visual: React.ReactNode;
}> = [
  {
    title: 'Context, compiled — not dumped',
    body: 'The Context Compiler retrieves, ranks, compresses, and cites within a token budget you set. Agents get exactly what fits, and can show why every fragment made the cut.',
    caption: 'MCP · compile_context',
    visual: <CompilePanel />,
  },
  {
    title: 'Change here. Know what breaks there.',
    body: 'Effect-links record which contracts depend on which code. Before an agent edits a symbol, get_effects answers what else this touches — before CI finds out the hard way.',
    caption: 'MCP · get_effects',
    visual: <EffectGraph />,
  },
  {
    title: 'Every byte of context, accounted for',
    body: 'Tenant isolation, role-based access, quotas, and an audit trail recorded at the API boundary. When an agent reads or writes context, governance can say who, what, and when.',
    caption: 'REST · /v1/audit',
    visual: <AuditVisual />,
  },
];

export function Differentiators() {
  return (
    <section
      id="product"
      aria-labelledby="product-title"
      className="grain relative scroll-mt-16 overflow-hidden py-24 md:py-32"
    >
      <Container>
        <Reveal>
          <SectionHeading
            id="product-title"
            title="What makes Tessera different"
            lead="Not a notes bucket — a compiler, an impact graph, and an audit trail for every byte of context."
          />
        </Reveal>
        <div className="mt-16 flex flex-col gap-20 md:mt-20 md:gap-28">
          {ROWS.map((row, index) => (
            <article
              key={row.caption}
              className="grid items-center gap-8 md:grid-cols-12 md:gap-12"
            >
              <Reveal className={cn('md:col-span-5', index % 2 === 1 && 'md:order-2')} delay={0}>
                <h3 className="text-heading text-foreground">{row.title}</h3>
                <p className="text-body text-muted-foreground mt-3">{row.body}</p>
                <p className="text-label text-faint-foreground mt-5 font-mono">{row.caption}</p>
              </Reveal>
              <Reveal className={cn('md:col-span-7', index % 2 === 1 && 'md:order-1')} delay={90}>
                {row.visual}
              </Reveal>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
