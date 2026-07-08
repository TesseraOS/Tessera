import type React from 'react';
import { CompilerAssembly } from '@/components/art/compiler-assembly';
import { EffectWeb } from '@/components/art/effect-web';
import { GovernanceGate } from '@/components/art/governance-gate';
import { Container } from '@/components/ui/container';
import { SectionHeading } from '@/components/ui/section-heading';
import { Reveal } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * The three differentiators (F-051 acceptance) as brand-language art (ADR-0044):
 * fragments assembling under a budget, the effect web on the graph engine, the policy
 * gate deciding — never terminal chrome.
 */
const ROWS: Array<{
  title: string;
  body: string;
  caption: string;
  visual: React.ReactNode;
}> = [
  {
    title: 'Context, compiled — not dumped',
    body: 'The Context Compiler retrieves, ranks, compresses, and cites within a token budget you set. Agents get exactly what fits, and can show why every fragment made the cut.',
    caption: 'the compiler · compile_context',
    visual: <CompilerAssembly />,
  },
  {
    title: 'Change here. Know what breaks there.',
    body: 'Effect-links record which contracts depend on which code. Before an agent edits a symbol, get_effects answers what else this touches — before CI finds out the hard way.',
    caption: 'effect-links · get_effects',
    visual: <EffectWeb />,
  },
  {
    title: 'Every byte of context, accounted for',
    body: 'Tenant isolation, role-based access, quotas, and an audit trail recorded at the API boundary. When an agent reads or writes context, governance can say who, what, and when.',
    caption: 'governance · the audit trail',
    visual: <GovernanceGate />,
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
        <div className="mt-16 flex flex-col gap-24 md:mt-20 md:gap-32">
          {ROWS.map((row, index) => (
            <article
              key={row.caption}
              className="grid items-center gap-10 md:grid-cols-12 md:gap-12"
            >
              <Reveal className={cn('md:col-span-5', index % 2 === 1 && 'md:order-2')} delay={0}>
                <h3 className="text-heading text-foreground">{row.title}</h3>
                <p className="text-body text-muted-foreground mt-3">{row.body}</p>
                <p className="text-label text-faint-foreground mt-5">{row.caption}</p>
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
