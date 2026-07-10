'use client';

import type React from 'react';
import { m, useReducedMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * PlanMosaic (MARKETING-DESIGN §3.12, ADR-0045 v4.5) — the pricing hero's signature
 * art: ONE engine at three scales. Three tessera clusters grow left to right (the
 * catalog's tiers) inside a single constant-derived SVG scene; a single ember rides the
 * shared baseline through all three — same engine, different size. The recommended
 * cluster receives the gilded tile (the band's one gold moment); the largest cluster
 * dissolves at its trailing edge (no ceiling). Tile fills are seeded (server/client
 * identical); hover warmth via the shared `.tile-hover` rule; all motion is
 * transform/opacity (never layout), frozen under reduced motion.
 *
 * Plan names arrive as PROPS from the PLANS-derived display model — this component
 * never hardcodes catalog facts (§1.5 honesty).
 */

const TILE = 22;
const GAP = 6;
const CLUSTER_GAP = 48;

/** Cluster shapes per tier — constant-derived so alignment holds by construction. */
const CLUSTERS = [
  { cols: 2, rows: 2 },
  { cols: 4, rows: 3 },
  { cols: 6, rows: 4 },
] as const;

const clusterWidth = (cols: number): number => cols * TILE + (cols - 1) * GAP;
const clusterHeight = (rows: number): number => rows * TILE + (rows - 1) * GAP;

/** Clusters zipped with their left offsets — one pass, no unchecked indexing. */
const SCENES = (() => {
  let x = 0;
  return CLUSTERS.map((cluster) => {
    const left = x;
    x += clusterWidth(cluster.cols) + CLUSTER_GAP;
    return { ...cluster, left };
  });
})();
const SCENE_W = SCENES.reduce((max, s) => Math.max(max, s.left + clusterWidth(s.cols)), 0);
const TALLEST = Math.max(...CLUSTERS.map((c) => clusterHeight(c.rows)));
const BASELINE_Y = TALLEST + 18;
const SCENE_H = BASELINE_Y + 10;

/** One shared clock: the ember crosses all three clusters every cycle. */
const CYCLE = 9;
const EMBER_TRAVEL = SCENE_W - 16;

/** Seeded LCG (MosaicField's) — deterministic markup across server and client. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 2 ** 32);
}

const FILLS = ['var(--secondary)', 'var(--secondary)', 'var(--burgundy)', 'var(--clay)'] as const;

interface PlanMosaicProps {
  /** Tier names in catalog order (from the PLANS display model — never hardcoded). */
  labels: readonly string[];
  /** Which cluster carries the gilded tile (the recommended tier). */
  recommendedIndex?: number;
  className?: string;
}

export function PlanMosaic({ labels, recommendedIndex = 1, className }: PlanMosaicProps) {
  const reduced = useReducedMotion();
  const rand = rng(70711);

  const tiles: React.ReactNode[] = [];
  SCENES.forEach((cluster, clusterIndex) => {
    const left = cluster.left;
    const top = TALLEST - clusterHeight(cluster.rows);
    const gilded = clusterIndex === recommendedIndex;
    const boundless = clusterIndex === CLUSTERS.length - 1;
    const gildCol = Math.floor(cluster.cols / 2);
    const gildRow = Math.max(0, Math.floor(cluster.rows / 2) - 1);

    for (let r = 0; r < cluster.rows; r += 1) {
      for (let c = 0; c < cluster.cols; c += 1) {
        const isGold = gilded && c === gildCol && r === gildRow;
        const fill = isGold
          ? 'var(--gold)'
          : (FILLS[Math.floor(rand() * FILLS.length)] ?? 'var(--secondary)');
        // The boundless cluster dissolves toward its trailing edge (no ceiling).
        const edgeFade = boundless ? 1 - Math.max(0, c - 2) * 0.17 : 1;
        const fillOpacity = (isGold ? 0.95 : 0.5 + rand() * 0.35) * edgeFade;
        tiles.push(
          <m.rect
            key={`${clusterIndex}-${r}-${c}`}
            x={left + c * (TILE + GAP)}
            y={top + r * (TILE + GAP)}
            width={TILE}
            height={TILE}
            rx={5}
            fill={fill}
            fillOpacity={fillOpacity}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: 0.5,
              delay: 0.1 + clusterIndex * 0.16 + (r * cluster.cols + c) * 0.018,
              ease: [0.22, 0.61, 0.36, 1],
            }}
            style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
          />,
        );
      }
    }
  });

  return (
    <div
      role="img"
      aria-label={`Three mosaics of the same tiles at growing sizes — ${labels.join(', ')} — with one ember traveling a shared baseline through all three: one engine at three scales. Decorative; the exact numbers are in the pricing table.`}
      className={cn('w-full', className)}
    >
      <svg
        viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}
        className="tile-hover h-auto w-full"
        aria-hidden="true"
      >
        {tiles}
        {/* the shared baseline — one engine under every tier */}
        <line
          x1={2}
          y1={BASELINE_Y}
          x2={SCENE_W - 2}
          y2={BASELINE_Y}
          stroke="var(--border-strong)"
          strokeWidth={1}
        />
        {/* One element for BOTH motion modes — branching SSR'd markup on
            useReducedMotion() hydration-mismatches (server always renders the
            animated branch); only animate/transition may vary. */}
        <m.circle
          cx={8}
          cy={BASELINE_Y}
          r={4}
          fill="var(--rose)"
          initial={{ x: 0, opacity: 0 }}
          animate={
            reduced
              ? { x: EMBER_TRAVEL / 2, opacity: 0.9 }
              : { x: [0, EMBER_TRAVEL, 0], opacity: [0, 1, 1, 1, 0.6] }
          }
          transition={
            reduced
              ? { duration: 0 }
              : {
                  duration: CYCLE,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  times: [0, 0.5, 1],
                  opacity: {
                    duration: CYCLE,
                    repeat: Infinity,
                    times: [0, 0.06, 0.5, 0.94, 1],
                  },
                }
          }
        />
      </svg>

      {/* tier names under their clusters — positions derived from the same constants */}
      <div className="relative mt-3 h-5" aria-hidden="true">
        {SCENES.map((cluster, i) => {
          const center = ((cluster.left + clusterWidth(cluster.cols) / 2) / SCENE_W) * 100;
          return (
            <span
              key={i}
              className={cn(
                'text-label absolute -translate-x-1/2 whitespace-nowrap',
                i === recommendedIndex ? 'text-foreground' : 'text-faint-foreground',
              )}
              style={{ left: `${center}%` }}
            >
              {labels[i] ?? ''}
            </span>
          );
        })}
      </div>
      <p className="text-label text-faint-foreground mt-4 text-center">one engine · three scales</p>
    </div>
  );
}
