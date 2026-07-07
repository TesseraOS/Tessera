'use client';

import { m, thermalEase, type Variants } from '@/lib/motion';

/**
 * Living effect-link graph (MARKETING-DESIGN §3.5): the rose dependency edges draw
 * themselves when the panel enters view — get_effects answering before the edit.
 */
const edgeVariants: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  show: (order: number) => ({
    pathLength: 1,
    opacity: 1,
    transition: { duration: 0.6, delay: 0.2 + order * 0.18, ease: thermalEase },
  }),
};

const nodeVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.4 } },
};

export function EffectGraph() {
  return (
    <m.svg
      viewBox="0 0 480 250"
      role="img"
      aria-label="Effect-link graph: TokenStore has three dependents — refresh.ts, api/session.ts, and sdk/client.ts; get_effects flags them before the change"
      className="w-full font-mono"
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.4 }}
    >
      <m.g variants={nodeVariants} stroke="var(--border-strong)" fill="none">
        <path d="M96 60 H 196" />
      </m.g>
      <g stroke="var(--rose)" fill="none" strokeWidth="1.5">
        <m.path variants={edgeVariants} custom={0} d="M292 74 L 356 44" />
        <m.path variants={edgeVariants} custom={1} d="M292 88 H 356" />
        <m.path variants={edgeVariants} custom={2} d="M292 102 L 356 148" />
      </g>
      <m.g variants={nodeVariants} fill="var(--card)" stroke="var(--border-strong)">
        <rect x="24" y="44" width="72" height="32" rx="6" />
        <rect x="196" y="64" width="96" height="48" rx="6" />
        <rect x="356" y="28" width="100" height="32" rx="6" />
        <rect x="356" y="72" width="100" height="32" rx="6" />
        <rect x="356" y="132" width="100" height="32" rx="6" />
      </m.g>
      <m.g variants={nodeVariants} fill="var(--muted-foreground)" fontSize="11">
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
      </m.g>
      <m.text variants={nodeVariants} x="300" y="206" fill="var(--rose)" fontSize="11">
        get_effects → 3 dependents
      </m.text>
    </m.svg>
  );
}
