'use client';

import { useState } from 'react';
import { m, useReducedMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * OneTile (MARKETING-DESIGN §3.14, ADR-0045 v4.10) — the cookies hero's legal
 * signature art: a storage shelf with every slot empty except one reserved outline for
 * the `theme` choice. A visitor dot sweeps the shelf and nothing lights — on first
 * load, nothing is written (the e2e-proven localStorage truth). Touch the shelf and
 * the single tile settles into its slot: written only when you choose. Gold budget:
 * the tile IS the band's one gold moment, and it spends itself only on interaction.
 * Constant-derived geometry; SSR-deterministic; still scene = the empty shelf (the
 * truthful resting state).
 */

const COLS = 4;
const ROWS = 2;
const SLOT = 44;
const GAP = 14;
const SHELF_X = 30;
const SHELF_Y = 34;
const SCENE_W = SHELF_X * 2 + COLS * SLOT + (COLS - 1) * GAP;
const SCENE_H = SHELF_Y * 2 + ROWS * SLOT + (ROWS - 1) * GAP + 8;

/** The one reserved slot (row 0, col 1) — dashed outline even when empty. */
const THEME_SLOT = { col: 1, row: 0 } as const;
const slotX = (col: number) => SHELF_X + col * (SLOT + GAP);
const slotY = (row: number) => SHELF_Y + row * (SLOT + GAP);

/** The visitor sweep — passes the shelf, writes nothing. */
const SWEEP_Y = SHELF_Y + ROWS * SLOT + (ROWS - 1) * GAP + 18;
const SWEEP_TRAVEL = SCENE_W - 60;
const CYCLE = 6;

interface LegalOneTileProps {
  className?: string;
}

export function LegalOneTile({ className }: LegalOneTileProps) {
  const reduced = useReducedMotion();
  const [touched, setTouched] = useState(false);

  return (
    <div
      role="img"
      aria-label="A storage shelf with every slot empty except one dashed outline reserved for the theme choice. A visitor passes and nothing is written; only touching the shelf settles the single tile into its slot — this site stores one localStorage entry, and only when you choose a theme. Decorative animation; still under reduced motion."
      className={cn('w-full', className)}
      onPointerEnter={() => setTouched(true)}
      onPointerLeave={() => setTouched(false)}
    >
      <svg viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} className="h-auto w-full" aria-hidden="true">
        {/* the shelf of empty slots */}
        {Array.from({ length: ROWS }, (_, row) =>
          Array.from({ length: COLS }, (_, col) => {
            const reserved = col === THEME_SLOT.col && row === THEME_SLOT.row;
            return (
              <rect
                key={`${row}-${col}`}
                x={slotX(col)}
                y={slotY(row)}
                width={SLOT}
                height={SLOT}
                rx={9}
                fill="var(--surface)"
                fillOpacity={0.5}
                stroke={reserved && touched ? 'var(--gold)' : 'var(--border-strong)'}
                strokeWidth={1}
                strokeDasharray={reserved ? '5 5' : undefined}
              />
            );
          }),
        )}

        {/* the one tile — exists only while the visitor chooses (hover response) */}
        <m.rect
          x={slotX(THEME_SLOT.col) + 6}
          y={slotY(THEME_SLOT.row) + 6}
          width={SLOT - 12}
          height={SLOT - 12}
          rx={7}
          fill="var(--gold)"
          initial={{ opacity: 0, y: -16, scale: 0.85 }}
          animate={
            touched ? { opacity: 0.95, y: 0, scale: 1 } : { opacity: 0, y: -16, scale: 0.85 }
          }
          transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        />

        {/* the visitor sweep — a pass that writes nothing */}
        <m.circle
          cx={30}
          cy={SWEEP_Y}
          r={3.5}
          fill="var(--clay)"
          initial={{ x: 0, opacity: 0 }}
          animate={
            reduced
              ? { x: SWEEP_TRAVEL / 2, opacity: 0.6 }
              : { x: [0, SWEEP_TRAVEL], opacity: [0, 0.85, 0.85, 0] }
          }
          transition={
            reduced
              ? { duration: 0 }
              : {
                  duration: CYCLE,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  opacity: { duration: CYCLE, repeat: Infinity, times: [0, 0.12, 0.88, 1] },
                }
          }
        />
      </svg>

      {/* slot name + the write condition — HTML, never SVG text */}
      <div className="text-label text-faint-foreground mt-3 flex items-center justify-between">
        <span className={cn('transition-colors duration-200', touched && 'text-foreground')}>
          theme · localStorage
        </span>
        <span
          className={cn(
            'transition-opacity duration-200',
            touched ? 'text-foreground opacity-100' : 'opacity-0',
          )}
        >
          written on your choice only
        </span>
      </div>
      <p className="text-label text-faint-foreground mt-4 text-center">
        no cookies · one slot · empty until you choose
      </p>
    </div>
  );
}
