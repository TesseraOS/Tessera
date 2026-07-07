import type React from 'react';
import { Container } from '@/components/ui/container';
import { SectionHeading } from '@/components/ui/section-heading';
import { cn } from '@/lib/utils';

/**
 * The three differentiators (F-051 acceptance): Context Compiler, effect-links, governance.
 * Asymmetric feature rows (MARKETING-DESIGN §3.4) — text 5 cols, product-true visual 7 cols,
 * alternating sides. Each visual is a token-built mock of a real surface, not decoration.
 */

const COMPILER_STAGES = [
  { stage: 'retrieve', detail: '214 candidates' },
  { stage: 'rank', detail: 'hybrid scores' },
  { stage: 'compress', detail: 'fits the budget' },
  { stage: 'cite', detail: 'every fragment' },
] as const;

function CompilerVisual() {
  return (
    <div
      role="img"
      aria-label="Compiler pipeline: retrieve 214 candidates, rank with hybrid scores, compress to fit the token budget, cite every fragment"
      className="grid gap-3 sm:grid-cols-2"
    >
      {COMPILER_STAGES.map((item, index) => (
        <div key={item.stage} className="bg-card rounded-md border p-4" aria-hidden="true">
          <p className="text-label text-faint-foreground font-mono">{index + 1}</p>
          <p className="text-small text-foreground mt-2 font-mono">{item.stage}</p>
          <p className="text-small text-muted-foreground mt-1">{item.detail}</p>
        </div>
      ))}
    </div>
  );
}

function EffectGraphVisual() {
  return (
    <svg
      viewBox="0 0 480 240"
      role="img"
      aria-label="Effect-link graph: TokenStore has three dependents — refresh.ts, api/session.ts, and sdk/client.ts; editing it is flagged before the change"
      className="w-full font-mono"
    >
      {/* edges */}
      <g stroke="var(--border-strong)" fill="none">
        <path d="M96 60 H 196" />
      </g>
      <g stroke="var(--accent)" fill="none">
        <path d="M292 74 L 356 44" />
        <path d="M292 88 H 356" />
        <path d="M292 102 L 356 148" />
      </g>
      {/* nodes */}
      <g fill="var(--card)" stroke="var(--border-strong)">
        <rect x="24" y="44" width="72" height="32" rx="6" />
        <rect x="196" y="64" width="96" height="48" rx="6" />
        <rect x="356" y="28" width="100" height="32" rx="6" />
        <rect x="356" y="72" width="100" height="32" rx="6" />
        <rect x="356" y="132" width="100" height="32" rx="6" />
      </g>
      <g fill="var(--muted-foreground)" fontSize="11">
        <text x="38" y="64">
          edit
        </text>
        <text x="212" y="86">
          TokenStore
        </text>
        <text x="212" y="100">
          contract
        </text>
        <text x="368" y="48">
          refresh.ts
        </text>
        <text x="368" y="92">
          api/session.ts
        </text>
        <text x="368" y="152">
          sdk/client.ts
        </text>
      </g>
      <text x="300" y="196" fill="var(--accent)" fontSize="11">
        get_effects → 3 dependents
      </text>
    </svg>
  );
}

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
      className="bg-card overflow-hidden rounded-lg border"
    >
      <div aria-hidden="true">
        <div className="flex h-10 items-center justify-between border-b px-4">
          <span className="text-label text-muted-foreground font-mono">audit · /v1/audit</span>
          <span className="text-label text-faint-foreground font-mono">tenant: default</span>
        </div>
        <ul className="divide-border divide-y">
          {AUDIT_ROWS.map((row) => (
            <li key={row.action} className="flex items-baseline justify-between gap-4 px-4 py-3">
              <span className="text-label text-foreground font-mono">{row.action}</span>
              <span className="text-label text-muted-foreground hidden font-mono sm:inline">
                {row.actor}
              </span>
              <span
                className={cn(
                  'text-label font-mono',
                  row.outcome === 'denied' ? 'text-foreground' : 'text-faint-foreground',
                )}
              >
                {row.outcome}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const ROWS: Array<{
  title: string;
  body: string;
  caption: string;
  visual: React.ReactNode;
}> = [
  {
    title: 'Context, compiled — not dumped',
    body: 'The Context Compiler retrieves, ranks, compresses, and cites within a token budget you set. Agents get exactly what fits, and can show why every fragment made the cut.',
    caption: 'MCP · compile_context',
    visual: <CompilerVisual />,
  },
  {
    title: 'Change here. Know what breaks there.',
    body: 'Effect-links record which contracts depend on which code. Before an agent edits a symbol, get_effects answers what else this touches — before CI finds out the hard way.',
    caption: 'MCP · get_effects',
    visual: <EffectGraphVisual />,
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
      className="bg-surface scroll-mt-16 border-y py-24 md:py-32"
    >
      <Container>
        <SectionHeading
          id="product-title"
          title="What makes Tessera different"
          lead="Not a notes bucket — a compiler, an impact graph, and an audit trail for every byte of context."
        />
        <div className="mt-16 flex flex-col gap-20 md:mt-20 md:gap-28">
          {ROWS.map((row, index) => (
            <article key={row.title} className="grid items-center gap-8 md:grid-cols-12 md:gap-12">
              <div className={cn('md:col-span-5', index % 2 === 1 && 'md:order-2')}>
                <h3 className="text-heading text-foreground">{row.title}</h3>
                <p className="text-body text-muted-foreground mt-3">{row.body}</p>
                <p className="text-label text-faint-foreground mt-5 font-mono">{row.caption}</p>
              </div>
              <div className={cn('md:col-span-7', index % 2 === 1 && 'md:order-1')}>
                {row.visual}
              </div>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
