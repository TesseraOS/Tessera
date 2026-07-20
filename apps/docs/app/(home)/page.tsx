import Link from 'next/link';
import { Mascot } from '@tessera/mascot';
import { HomeHeroArt } from '@/components/art/home-hero-art';

/**
 * The docs home (DOCS-DESIGN §5): an atmosphere hero — serif statement, the arriving-
 * tile art, Tess greeting readers (its gilded heart is this viewport's one gold
 * moment) — over a six-card section index. Static, tokens-only, CSS-only motion.
 */

const SECTIONS = [
  {
    href: '/docs/quickstart',
    title: 'Quickstart',
    body: 'From a checkout to an agent compiling cited context — init, ingest, connect.',
  },
  {
    href: '/docs/concepts',
    title: 'Concepts',
    body: 'The compiler, effect-links, memory, the knowledge graph, retrieval, provenance.',
  },
  {
    href: '/docs/guides',
    title: 'Guides',
    body: 'Sources, budgets, memory habits, tokens and RBAC, governance, backups.',
  },
  {
    href: '/docs/agents',
    title: 'Agents',
    body: 'Copy-paste MCP setup for Claude Code, Cursor, Cline, Codex CLI, and Continue.',
  },
  {
    href: '/docs/reference',
    title: 'Reference',
    body: 'Generated REST, MCP, CLI, and configuration references — drift-checked in CI.',
  },
  {
    href: '/docs/deployment',
    title: 'Deployment',
    body: 'The Local profile in depth, and the honest state of self-hosting.',
  },
] as const;

export default function HomePage() {
  return (
    <main className="flex-1">
      {/* hero */}
      <section aria-labelledby="home-title" className="relative isolate overflow-hidden">
        <div className="atmosphere absolute inset-0 -z-10" aria-hidden />
        <div className="grain absolute inset-0 -z-10" aria-hidden />
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-6 pt-20 pb-16 md:grid-cols-12 md:gap-8 md:pt-28 md:pb-24">
          <div className="md:col-span-7">
            <p className="text-faint-foreground text-[0.8125rem] font-medium tracking-[0.08em] uppercase">
              Tessera documentation
            </p>
            <h1
              id="home-title"
              className="text-foreground mt-4 text-[clamp(2.375rem,3vw+1.25rem,3.875rem)] leading-[1.08] text-balance"
            >
              Every scattered piece, <em className="text-rose">placed</em>.
            </h1>
            <p className="text-muted-foreground mt-6 max-w-xl text-lg leading-relaxed text-pretty">
              Tessera compiles your repositories, decisions, and memory into budgeted, cited
              context packages for any MCP-capable coding agent. This manual covers everything —
              first run to reference.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                href="/docs/quickstart"
                className="bg-primary text-primary-foreground rounded-lg px-5 py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-[color-mix(in_oklab,var(--primary)_88%,var(--rose))]"
              >
                Start in five minutes
              </Link>
              <Link
                href="/docs/agents"
                className="text-foreground border-border-strong hover:border-rose rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors duration-200"
              >
                Connect your agent
              </Link>
              <span className="text-faint-foreground text-sm">
                or press <kbd className="border-border rounded border px-1.5 py-0.5 font-mono text-xs">Ctrl K</kbd> to search
              </span>
            </div>
          </div>
          <div className="relative hidden justify-end md:col-span-5 md:flex">
            <HomeHeroArt className="w-full max-w-sm" />
            <div className="absolute -right-2 -bottom-6">
              <Mascot mood="greeting" size={132} />
            </div>
          </div>
        </div>
      </section>

      {/* section index */}
      <section aria-label="Documentation sections" className="mx-auto w-full max-w-6xl px-6 pb-24">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="docs-card bg-card border-border group rounded-xl border p-6"
            >
              <h2 className="text-card-foreground font-sans text-base font-semibold tracking-normal">
                {section.title}
                <span
                  aria-hidden
                  className="text-rose ml-1 inline-block transition-transform duration-200 group-hover:translate-x-0.5"
                >
                  →
                </span>
              </h2>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{section.body}</p>
            </Link>
          ))}
        </div>

        {/* agent-readability note */}
        <p className="text-faint-foreground mt-12 text-sm">
          Reading this as an agent? The whole site is available as plain text at{' '}
          <Link href="/llms.txt" className="text-rose underline underline-offset-4">
            /llms.txt
          </Link>{' '}
          and{' '}
          <Link href="/llms-full.txt" className="text-rose underline underline-offset-4">
            /llms-full.txt
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
