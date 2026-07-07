'use client';

import { m, thermalEase, type Variants } from '@/lib/motion';

/**
 * Living compile trace (MARKETING-DESIGN §3.5): fragments cascade in, the budget bar
 * fills, the package cites its sources — triggered once in view. Product-true (the
 * shipped compiler's scores/budget/citations); illustrative values, real mechanics.
 * Accent spend: budget bar + top score (rose).
 */

const FRAGMENTS = [
  { kind: 'repo', label: 'src/auth/refresh.ts' },
  { kind: 'git', label: 'PR 142 · rotate tokens' },
  { kind: 'adr', label: '0021-token-rotation.md' },
  { kind: 'memory', label: 'lessons/auth-retry.md' },
  { kind: 'graph', label: 'TokenStore → 3 dependents' },
  { kind: 'docs', label: 'architecture.md §4.2' },
] as const;

const SELECTED = [
  { rank: '1', source: 'src/auth/refresh.ts:42–88', score: '0.94', top: true },
  { rank: '2', source: 'adr/0021-token-rotation.md', score: '0.91', top: false },
  { rank: '3', source: 'memory/auth-retry.md', score: '0.88', top: false },
] as const;

const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: thermalEase } },
};

export function CompilePanel({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Compile trace: six context fragments — repo files, a pull request, an ADR, a memory, graph effects, and docs — compiled into one 6,148-token context package with cited, scored sources, served over MCP"
      data-band="dusk"
      className={`bg-code overflow-hidden rounded-lg border text-left ${className ?? ''}`}
    >
      <div aria-hidden="true">
        <div className="bg-card flex h-10 items-center justify-between border-b px-4">
          <span className="text-label text-muted-foreground font-mono">
            tessera · compile_context
          </span>
          <span className="text-label text-faint-foreground font-mono">MCP</span>
        </div>

        <div className="grid md:grid-cols-12">
          <div className="border-b p-5 md:col-span-5 md:border-r md:border-b-0">
            <p className="text-label text-faint-foreground font-mono">
              fragments in · 214 considered
            </p>
            <m.ul
              variants={listVariants}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.3 }}
              className="mt-4 flex flex-col gap-2.5"
            >
              {FRAGMENTS.map((fragment) => (
                <m.li
                  key={fragment.label}
                  variants={itemVariants}
                  className="flex items-baseline gap-3"
                >
                  <span className="text-label text-faint-foreground w-14 shrink-0 font-mono">
                    {fragment.kind}
                  </span>
                  <span className="text-label text-muted-foreground font-mono">
                    {fragment.label}
                  </span>
                </m.li>
              ))}
            </m.ul>
          </div>

          <div className="flex items-center justify-center gap-3 border-b p-5 md:col-span-2 md:flex-col md:border-r md:border-b-0">
            <span className="text-label text-muted-foreground font-mono">compile</span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-faint-foreground size-4 rotate-90 md:rotate-0"
              aria-hidden="true"
            >
              <path d="M4 12h14m0 0-5-5m5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-label text-faint-foreground font-mono">8k budget</span>
          </div>

          <div className="p-5 md:col-span-5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-label text-foreground font-mono">context.pkg</p>
              <p className="text-label text-faint-foreground font-mono">6,148 / 8,000 tokens</p>
            </div>
            <div className="bg-secondary mt-3 h-1 w-full overflow-hidden rounded-full">
              <m.div
                className="bg-rose h-full w-3/4 origin-left rounded-full"
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 0.8, delay: 0.35, ease: [0.22, 0.61, 0.36, 1] }}
              />
            </div>
            <m.ul
              variants={listVariants}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.3 }}
              className="mt-4 flex flex-col gap-2.5"
            >
              {SELECTED.map((line) => (
                <m.li
                  key={line.rank}
                  variants={itemVariants}
                  className="flex items-baseline justify-between gap-3"
                >
                  <span className="text-label text-muted-foreground font-mono">
                    <span className="text-faint-foreground">{line.rank} </span>
                    {line.source}
                  </span>
                  <span
                    className={`text-label shrink-0 font-mono ${line.top ? 'text-rose' : 'text-faint-foreground'}`}
                  >
                    {line.score}
                  </span>
                </m.li>
              ))}
            </m.ul>
            <p className="text-label text-faint-foreground mt-4 font-mono">
              + 9 more · every fragment cited → served to claude-code
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
