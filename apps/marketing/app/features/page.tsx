import type { Metadata } from 'next';
import type React from 'react';
import { CompilerAssembly } from '@/components/art/compiler-assembly';
import { EffectWeb } from '@/components/art/effect-web';
import { GovernanceGate } from '@/components/art/governance-gate';
import { CtaBand } from '@/components/home/cta-band';
import { PageHeader } from '@/components/page-header';
import { SiteFooter } from '@/components/site-footer';
import { SiteNav } from '@/components/site-nav';
import { Badge } from '@/components/ui/badge';
import { Container } from '@/components/ui/container';
import { SectionHeading } from '@/components/ui/section-heading';
import { Reveal } from '@/lib/motion';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Features',
  description:
    'The full Tessera capability inventory — the Context Compiler pipeline, effect-links, governance, durable memory, hybrid retrieval, and every agent surface.',
  alternates: { canonical: '/features' },
};

/** The three pillars, one level deeper than the homepage tells them. */
const PILLARS: Array<{
  title: string;
  body: string;
  caption: string;
  visual: React.ReactNode;
}> = [
  {
    title: 'A pipeline, not a prompt stuffer',
    body: 'compile_context runs plan → retrieve → expand → rank → dedup → compress → assemble. Over-budget fragments are compressed, never silently dropped, and every fragment keeps its citation and a why-included you can inspect stage by stage.',
    caption: 'the compiler · plan → assemble',
    visual: <CompilerAssembly />,
  },
  {
    title: 'The blast radius, before the edit',
    body: 'Files, symbols, modules, decisions, and memories live in one knowledge graph. Effect-links carry rationale and confidence — asserted by your team or derived from static analysis — so get_effects returns ranked dependents with the paths that connect them.',
    caption: 'effect-links · get_effects',
    visual: <EffectWeb />,
  },
  {
    title: 'Access, spend, and audit in one place',
    body: 'Tenants are isolated at the data plane, roles gate every route, and plan quotas are enforced at the gateway. Each read and write of context lands in an audit trail — who, what, and when.',
    caption: 'governance · the audit trail',
    visual: <GovernanceGate />,
  },
];

/** Everything below ships today — each card traces to a shipped subsystem. */
const CAPABILITIES = [
  {
    title: 'Durable memory',
    body: 'Decisions, lessons, and incidents captured with metadata — versioned and supersedable, never silently mutated. Memory survives session resets and model swaps.',
  },
  {
    title: 'Hybrid retrieval',
    body: 'Five signals — semantic, keyword, graph, symbolic, temporal — fused by a weighted ranker, with per-candidate attribution you can inspect.',
  },
  {
    title: 'A living knowledge graph',
    body: 'Files, symbols, modules, people, and decisions as nodes; symbol extraction keeps the graph current as your code changes.',
  },
  {
    title: 'Incremental ingestion',
    body: 'Filesystem, Git, and GitHub connectors with content-hash diffing — a small change never re-indexes the world. Secrets are scrubbed before anything persists.',
  },
  {
    title: 'Every agent surface',
    body: 'MCP tools, a versioned REST API with OpenAPI, a generated TypeScript SDK, and server-sent events for live updates.',
  },
  {
    title: 'Provenance end to end',
    body: 'Every fragment carries its source and its reason for inclusion; the package inspector replays each pipeline stage, drops included.',
  },
  {
    title: 'Deployment profiles',
    body: 'Local with SQLite and in-process embeddings, or self-hosted with Postgres + pgvector — switch by configuration, not migration.',
  },
  {
    title: 'Observable by default',
    body: 'OpenTelemetry traces from API to compiler stage to adapter; structured logs that never contain secrets or raw content.',
  },
] as const;

/** The real tool surface (mirrors llms.txt) — names, not screenshots. */
const MCP_TOOLS = [
  'compile_context',
  'search',
  'get_effects',
  'capture_memory',
  'query_graph',
  'explain',
  'add_source',
  'scan_source',
  'list_sources',
  'assert_effect',
] as const;

export default function FeaturesPage() {
  return (
    <>
      <SiteNav />
      <main>
        <PageHeader
          eyebrow="product"
          title={
            <>
              Everything your agents forget, <em className="text-rose">kept</em>.
            </>
          }
          lead="Tessera ingests repos and decisions, builds a knowledge graph and durable memory, and compiles budgeted, cited context packages for any MCP client."
        />

        <section
          id="pillars"
          aria-labelledby="pillars-title"
          className="grain relative scroll-mt-16 overflow-hidden py-24 md:py-32"
        >
          <Container>
            <Reveal>
              <SectionHeading
                id="pillars-title"
                title="The three pillars, up close"
                lead="A compiler, an impact graph, and an audit trail — the mechanics behind each."
              />
            </Reveal>
            <div className="mt-16 flex flex-col gap-24 md:mt-20 md:gap-32">
              {PILLARS.map((row, index) => (
                <article
                  key={row.caption}
                  className="grid items-center gap-10 md:grid-cols-12 md:gap-12"
                >
                  <Reveal
                    className={cn('md:col-span-5', index % 2 === 1 && 'md:order-2')}
                    delay={0}
                  >
                    <h3 className="text-heading text-foreground">{row.title}</h3>
                    <p className="text-body text-muted-foreground mt-3">{row.body}</p>
                    <p className="text-label text-faint-foreground mt-5">{row.caption}</p>
                  </Reveal>
                  <Reveal
                    className={cn('md:col-span-7', index % 2 === 1 && 'md:order-1')}
                    delay={90}
                  >
                    {row.visual}
                  </Reveal>
                </article>
              ))}
            </div>
          </Container>
        </section>

        <section
          id="capabilities"
          data-band="chapter"
          aria-labelledby="capabilities-title"
          className="bg-background text-foreground scroll-mt-16 border-y"
        >
          <Container className="py-24 md:py-32">
            <Reveal>
              <SectionHeading
                id="capabilities-title"
                title="And the rest of the engine"
                lead="The pillars stand on a full platform — everything below ships today."
              />
            </Reveal>
            <ul className="mt-12 grid gap-5 md:mt-16 md:grid-cols-2 md:gap-6 lg:grid-cols-4">
              {CAPABILITIES.map((capability, index) => (
                <li key={capability.title} className="h-full">
                  <Reveal
                    delay={(index % 4) * 90}
                    className="bg-card shadow-soft h-full rounded-lg border p-6"
                  >
                    <h3 className="text-heading text-foreground">{capability.title}</h3>
                    <p className="text-body text-muted-foreground mt-3">{capability.body}</p>
                  </Reveal>
                </li>
              ))}
            </ul>
          </Container>
        </section>

        <section
          id="mcp-surface"
          aria-labelledby="mcp-surface-title"
          className="bg-surface/60 scroll-mt-16"
        >
          <Container className="py-24 md:py-32">
            <Reveal>
              <SectionHeading
                id="mcp-surface-title"
                title="Capabilities agents can call"
                lead="The whole engine is a tool surface — served over MCP, not locked behind a UI."
              />
            </Reveal>
            <Reveal delay={90}>
              <ul className="mt-10 flex max-w-3xl flex-wrap gap-3">
                {MCP_TOOLS.map((tool) => (
                  <li key={tool}>
                    <Badge>{tool}</Badge>
                  </li>
                ))}
              </ul>
            </Reveal>
          </Container>
        </section>

        <CtaBand />
      </main>
      <SiteFooter />
    </>
  );
}
