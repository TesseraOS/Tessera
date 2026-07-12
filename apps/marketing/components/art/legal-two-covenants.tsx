'use client';

import { useState } from 'react';
import { m, useReducedMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * TwoCovenants (MARKETING-DESIGN §3.14, ADR-0045 v4.10) — the terms hero's legal
 * signature art: ONE engine core between two grounds. Left, the open field —
 * self-hosted tiles under the sky, governed by the repository license. Right, the
 * managed canopy — the same tiles inside a tended perimeter, governed by service
 * terms. Packets leave the shared core toward both grounds on one clock: same engine,
 * two covenants. Hover lifts the covenant under the pointer. Constant-derived
 * geometry; SSR-deterministic markup; frozen as a designed mid-story scene.
 */

const SCENE_W = 440;
const SCENE_H = 220;
const CORE_Y = 108;

/** The shared core — a 2×2 tessera mark dead center; its gilded tile is the band's gold moment. */
const TILE = 20;
const GAP = 5;
const MARK = TILE * 2 + GAP;
const CORE_X = SCENE_W / 2 - MARK / 2;
const MARK_FILLS = ['var(--clay)', 'var(--secondary)', 'var(--gold)', 'var(--burgundy)'] as const;

/** Open field (left): free tiles over a horizon hairline. */
const FIELD_TILES = [
  { x: 34, y: 78, drift: -7, duration: 10 },
  { x: 86, y: 126, drift: -5, duration: 12 },
  { x: 52, y: 158, drift: -8, duration: 11 },
] as const;
const HORIZON_Y = 196;

/** Managed canopy (right): a tended island with its own small mosaic. */
const ISLAND = { x: 288, y: 66, w: 128, h: 108 } as const;
const ISLAND_TILES = [
  { x: ISLAND.x + 24, y: ISLAND.y + 26 },
  { x: ISLAND.x + 58, y: ISLAND.y + 48 },
  { x: ISLAND.x + 30, y: ISLAND.y + 70 },
] as const;

/** Packets: core → field and core → canopy, alternating halves of one cycle. */
const CYCLE = 8;
const LEFT_DELTA = -(CORE_X - 70);
const RIGHT_DELTA = ISLAND.x + 36 - (CORE_X + MARK);

type Side = 'field' | 'canopy' | null;

interface LegalTwoCovenantsProps {
  className?: string;
}

export function LegalTwoCovenants({ className }: LegalTwoCovenantsProps) {
  const reduced = useReducedMotion();
  const [side, setSide] = useState<Side>(null);

  return (
    <div
      role="img"
      aria-label="One engine core between two grounds: an open field for self-hosted deployments governed by the repository license, and a managed canopy governed by service terms. Packets flow from the same core to both — same engine, two covenants. Decorative animation; still under reduced motion."
      className={cn('relative w-full', className)}
      onPointerLeave={() => setSide(null)}
    >
      <svg viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} className="h-auto w-full" aria-hidden="true">
        {/* the open field — horizon + free tiles (lighter covenant: outlines, air) */}
        <m.g
          initial={{ scale: 1 }}
          animate={{ scale: side === 'field' ? 1.02 : 1 }}
          transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
          style={{ transformOrigin: `100px ${CORE_Y}px`, transformBox: 'view-box' }}
        >
          <line
            x1={16}
            y1={HORIZON_Y}
            x2={188}
            y2={HORIZON_Y}
            stroke="var(--border-strong)"
            strokeWidth={1}
          />
          {FIELD_TILES.map((tile, i) => (
            <m.g
              key={i}
              initial={{ y: 0 }}
              animate={reduced ? { y: tile.drift / 2 } : { y: [0, tile.drift, 0] }}
              transition={
                reduced
                  ? { duration: 0 }
                  : { duration: tile.duration, repeat: Infinity, ease: 'easeInOut' }
              }
            >
              <rect
                x={tile.x}
                y={tile.y}
                width={TILE}
                height={TILE}
                rx={5}
                fill="var(--secondary)"
                fillOpacity={0.4}
                stroke="var(--border-strong)"
                strokeWidth={1}
              />
            </m.g>
          ))}
        </m.g>

        {/* the managed canopy — tended island under an arc (fuller covenant: card ground) */}
        <m.g
          initial={{ scale: 1 }}
          animate={{ scale: side === 'canopy' ? 1.02 : 1 }}
          transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
          style={{
            transformOrigin: `${ISLAND.x + ISLAND.w / 2}px ${CORE_Y}px`,
            transformBox: 'view-box',
          }}
        >
          <path
            d={`M ${ISLAND.x - 10} ${ISLAND.y + 6} Q ${ISLAND.x + ISLAND.w / 2} ${ISLAND.y - 44} ${ISLAND.x + ISLAND.w + 10} ${ISLAND.y + 6}`}
            fill="none"
            stroke="var(--border-strong)"
            strokeWidth={1}
            strokeDasharray="3 6"
          />
          <rect
            x={ISLAND.x}
            y={ISLAND.y}
            width={ISLAND.w}
            height={ISLAND.h}
            rx={12}
            fill="var(--card)"
            fillOpacity={0.6}
            stroke="var(--border-strong)"
            strokeWidth={1}
          />
          {ISLAND_TILES.map((tile, i) => (
            <rect
              key={i}
              x={tile.x}
              y={tile.y}
              width={TILE}
              height={TILE}
              rx={5}
              fill={i === 1 ? 'var(--burgundy)' : 'var(--clay)'}
              fillOpacity={0.8}
            />
          ))}
        </m.g>

        {/* the shared core */}
        {MARK_FILLS.map((fill, i) => (
          <rect
            key={i}
            x={CORE_X + (i % 2) * (TILE + GAP)}
            y={CORE_Y - MARK / 2 + Math.floor(i / 2) * (TILE + GAP)}
            width={TILE}
            height={TILE}
            rx={5}
            fill={fill}
            fillOpacity={fill === 'var(--gold)' ? 0.95 : 0.8}
          />
        ))}

        {/* packets — the same engine feeding both covenants, alternating on one clock */}
        <m.circle
          cx={CORE_X - 4}
          cy={CORE_Y}
          r={4}
          fill="var(--rose)"
          initial={{ x: 0, opacity: 0 }}
          animate={
            reduced
              ? { x: LEFT_DELTA * 0.6, opacity: 0.9 }
              : { x: [0, LEFT_DELTA], opacity: [0, 1, 1, 0] }
          }
          transition={
            reduced
              ? { duration: 0 }
              : {
                  duration: CYCLE,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  times: [0, 0.38],
                  opacity: { duration: CYCLE, repeat: Infinity, times: [0, 0.06, 0.32, 0.4] },
                }
          }
        />
        <m.circle
          cx={CORE_X + MARK + 4}
          cy={CORE_Y}
          r={4}
          fill="var(--rose)"
          initial={{ x: 0, opacity: 0 }}
          animate={
            reduced
              ? { x: RIGHT_DELTA * 0.6, opacity: 0.9 }
              : { x: [0, RIGHT_DELTA], opacity: [0, 1, 1, 0] }
          }
          transition={
            reduced
              ? { duration: 0 }
              : {
                  duration: CYCLE,
                  delay: CYCLE / 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  times: [0, 0.38],
                  opacity: {
                    duration: CYCLE,
                    delay: CYCLE / 2,
                    repeat: Infinity,
                    times: [0, 0.06, 0.32, 0.4],
                  },
                }
          }
        />
      </svg>

      {/* hover zones + covenant names — HTML, never SVG text */}
      <div className="absolute inset-0 flex" aria-hidden="true">
        <div className="h-full w-1/2" onPointerEnter={() => setSide('field')} />
        <div className="h-full w-1/2" onPointerEnter={() => setSide('canopy')} />
      </div>
      <div className="text-label text-faint-foreground mt-3 flex items-center justify-between gap-4">
        <span
          className={cn(
            'w-1/2 text-center transition-colors duration-200',
            side === 'field' && 'text-foreground',
          )}
        >
          self-host · repository license
        </span>
        <span
          className={cn(
            'w-1/2 text-center transition-colors duration-200',
            side === 'canopy' && 'text-foreground',
          )}
        >
          managed cloud · service terms
        </span>
      </div>
      <p className="text-label text-faint-foreground mt-4 text-center">
        same engine · two covenants
      </p>
    </div>
  );
}
