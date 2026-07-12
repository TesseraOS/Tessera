'use client';

import { useState } from 'react';
import { m, useReducedMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * Nameplate (MARKETING-DESIGN §3.14, ADR-0045 v4.10) — the imprint hero's legal
 * signature art: a nameplate where the nine-tile Tessera seal assembles once (the
 * product identity is real), beside engraved lines left visibly blank (the operator
 * facts are not — they are engraved on incorporation; the counsel placeholders, as
 * art). One line catches a faint waiting shimmer per cycle. Hover warms the empty
 * engravings and states why they are empty. Constant-derived geometry;
 * SSR-deterministic; reduced motion = the assembled seal beside still, blank lines.
 */

const SCENE_W = 440;
const SCENE_H = 210;

/** The plaque. */
const PLATE = { x: 14, y: 22, w: SCENE_W - 28, h: SCENE_H - 44 } as const;

/** The 3×3 seal — assembles once, then breathes. Center tile is the gold moment. */
const TILE = 26;
const GAP = 7;
const SEAL = TILE * 3 + GAP * 2;
const SEAL_X = 52;
const SEAL_Y = PLATE.y + (PLATE.h - SEAL) / 2;
const SEAL_FILLS = [
  'var(--secondary)',
  'var(--clay)',
  'var(--burgundy)',
  'var(--clay)',
  'var(--gold)',
  'var(--secondary)',
  'var(--burgundy)',
  'var(--secondary)',
  'var(--clay)',
] as const;
/** Arrival offsets — tiles fly in from a loose scatter, once. */
const SCATTER = [
  { dx: -34, dy: -22 },
  { dx: 0, dy: -38 },
  { dx: 30, dy: -18 },
  { dx: -40, dy: 4 },
  { dx: 0, dy: 0 },
  { dx: 42, dy: 6 },
  { dx: -26, dy: 28 },
  { dx: 4, dy: 40 },
  { dx: 32, dy: 26 },
] as const;

/** The engraved lines — blank by design (entity · address · register · contact). */
const LINES_X = SEAL_X + SEAL + 44;
const LINES = [
  { y: SEAL_Y + 10, w: 168 },
  { y: SEAL_Y + 38, w: 128 },
  { y: SEAL_Y + 66, w: 150 },
  { y: SEAL_Y + 94, w: 108 },
] as const;

const CYCLE = 7;
/** The shimmer traverses the longest line once per cycle. */
const SHIMMER_LINE = LINES[0];

interface LegalNameplateProps {
  className?: string;
}

export function LegalNameplate({ className }: LegalNameplateProps) {
  const reduced = useReducedMotion();
  const [reading, setReading] = useState(false);

  return (
    <div
      role="img"
      aria-label="A nameplate: the nine-tile Tessera seal sits assembled beside engraved lines left intentionally blank — the operator's entity, address, register, and contact entries are engraved only on incorporation. Decorative animation; still under reduced motion."
      className={cn('w-full', className)}
      onPointerEnter={() => setReading(true)}
      onPointerLeave={() => setReading(false)}
    >
      <svg viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} className="h-auto w-full" aria-hidden="true">
        {/* the plaque */}
        <rect
          x={PLATE.x}
          y={PLATE.y}
          width={PLATE.w}
          height={PLATE.h}
          rx={14}
          fill="var(--card)"
          fillOpacity={0.55}
          stroke="var(--border-strong)"
          strokeWidth={1}
        />

        {/* the seal — arrival once (per §5 the gilded arrival), then a slow breath */}
        <m.g
          initial={{ scale: 1 }}
          animate={reduced ? { scale: 1 } : { scale: [1, 1.012, 1] }}
          transition={
            reduced ? { duration: 0 } : { duration: 5.5, repeat: Infinity, ease: 'easeInOut' }
          }
          style={{
            transformOrigin: `${SEAL_X + SEAL / 2}px ${SEAL_Y + SEAL / 2}px`,
            transformBox: 'view-box',
          }}
        >
          {SEAL_FILLS.map((fill, i) => {
            const scatter = SCATTER[i] ?? { dx: 0, dy: 0 };
            return (
              <m.rect
                key={i}
                x={SEAL_X + (i % 3) * (TILE + GAP)}
                y={SEAL_Y + Math.floor(i / 3) * (TILE + GAP)}
                width={TILE}
                height={TILE}
                rx={6}
                fill={fill}
                fillOpacity={fill === 'var(--gold)' ? 0.95 : 0.8}
                initial={{ opacity: 0, x: scatter.dx, y: scatter.dy, scale: 0.7 }}
                animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : {
                        duration: 0.55,
                        delay: 0.15 + i * 0.06,
                        ease: [0.22, 0.61, 0.36, 1],
                      }
                }
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
              />
            );
          })}
        </m.g>

        {/* the engraved lines — blank; hover warms them */}
        {LINES.map((line, i) => (
          <g key={i}>
            <rect
              x={LINES_X - 8}
              y={line.y - 1}
              width={4}
              height={4}
              rx={1}
              fill="var(--faint-foreground)"
              opacity={0.5}
            />
            <line
              x1={LINES_X + 2}
              y1={line.y + 1}
              x2={LINES_X + 2 + line.w}
              y2={line.y + 1}
              stroke={reading ? 'var(--rose)' : 'var(--border-strong)'}
              strokeWidth={1}
              strokeDasharray={reading ? '2 4' : undefined}
              opacity={reading ? 0.9 : 1}
            />
          </g>
        ))}

        {/* the waiting shimmer — a faint highlight crosses the first blank line */}
        <m.rect
          x={LINES_X}
          y={SHIMMER_LINE.y - 2}
          width={26}
          height={5}
          rx={2.5}
          fill="var(--foreground)"
          initial={{ x: 0, opacity: 0 }}
          animate={
            reduced
              ? { x: 0, opacity: 0 }
              : { x: [0, SHIMMER_LINE.w - 26], opacity: [0, 0.18, 0.18, 0] }
          }
          transition={
            reduced
              ? { duration: 0 }
              : {
                  duration: CYCLE,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  times: [0.3, 0.62],
                  opacity: { duration: CYCLE, repeat: Infinity, times: [0.28, 0.34, 0.56, 0.64] },
                }
          }
        />
      </svg>

      {/* what the blanks are + the hover readout — HTML, never SVG text */}
      <div className="text-label text-faint-foreground mt-3 flex items-center justify-between">
        <span>the seal is real</span>
        <span
          className={cn(
            'transition-opacity duration-200',
            reading ? 'text-foreground opacity-100' : 'opacity-0',
          )}
        >
          awaiting incorporation
        </span>
        <span>the plate waits</span>
      </div>
      <p className="text-label text-faint-foreground mt-4 text-center">
        entity · address · register — engraved on incorporation
      </p>
    </div>
  );
}
