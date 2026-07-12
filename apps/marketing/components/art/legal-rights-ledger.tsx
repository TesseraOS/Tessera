'use client';

import { useState } from 'react';
import { m, useReducedMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * RightsLedger (MARKETING-DESIGN §3.14, ADR-0045 v4.10) — the gdpr hero's legal
 * signature art: the data-subject rights model around a vault of tiles. One cycle,
 * three beats: an access REQUEST arrives at the vault; an EXPORT copy leaves while the
 * original stays (access / portability); one tile DISSOLVES on request (erasure) and
 * the vault carries on. A rights model drawn honestly — no live-feature claim, no
 * compliance badge. Hover surfaces the article numbers. Constant-derived geometry;
 * SSR-deterministic; reduced motion = the whole story frozen at once.
 */

const SCENE_W = 440;
const SCENE_H = 216;

/** The vault and its tiles. */
const VAULT = { x: 150, y: 44, w: 168, h: 132 } as const;
const TILE = 30;
const GAP = 9;
const GRID_X = VAULT.x + (VAULT.w - (TILE * 3 + GAP * 2)) / 2;
const GRID_Y = VAULT.y + (VAULT.h - (TILE * 2 + GAP)) / 2;
const VAULT_TILES = [
  'var(--secondary)',
  'var(--clay)',
  'var(--burgundy)',
  'var(--clay)',
  'var(--secondary)',
  'var(--burgundy)',
] as const;
/** Which tile the export copies (top middle) and which one erasure dissolves (bottom right). */
const EXPORT_INDEX = 1;
const ERASE_INDEX = 5;

const tileX = (i: number) => GRID_X + (i % 3) * (TILE + GAP);
const tileY = (i: number) => GRID_Y + Math.floor(i / 3) * (TILE + GAP);

/** One cycle, three beats. */
const CYCLE = 10;
const REQUEST_DELTA = VAULT.x - 8 - 24;
const EXPORT_DELTA = SCENE_W - 30 - tileX(EXPORT_INDEX);

const RIGHTS = [
  { label: 'access', article: 'art. 15' },
  { label: 'portability', article: 'art. 20' },
  { label: 'erasure', article: 'art. 17' },
] as const;

interface LegalRightsLedgerProps {
  className?: string;
}

export function LegalRightsLedger({ className }: LegalRightsLedgerProps) {
  const reduced = useReducedMotion();
  const [reading, setReading] = useState(false);

  return (
    <div
      role="img"
      aria-label="The data-subject rights model around a vault of tiles: an access request arrives, an export copy leaves while the original stays, and one tile dissolves on request — access, portability, and erasure drawn as motion. Decorative animation; still under reduced motion."
      className={cn('w-full', className)}
      onPointerEnter={() => setReading(true)}
      onPointerLeave={() => setReading(false)}
    >
      <svg viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} className="h-auto w-full" aria-hidden="true">
        {/* the vault — warms when the request lands */}
        <rect
          x={VAULT.x}
          y={VAULT.y}
          width={VAULT.w}
          height={VAULT.h}
          rx={14}
          fill="var(--card)"
          fillOpacity={0.55}
          stroke="var(--border-strong)"
          strokeWidth={1}
        />
        <m.rect
          x={VAULT.x}
          y={VAULT.y}
          width={VAULT.w}
          height={VAULT.h}
          rx={14}
          fill="none"
          stroke="var(--rose)"
          strokeWidth={1.5}
          initial={{ opacity: 0 }}
          animate={reduced ? { opacity: 0.5 } : { opacity: [0, 0, 0.9, 0, 0] }}
          transition={
            reduced
              ? { duration: 0 }
              : { duration: CYCLE, repeat: Infinity, times: [0, 0.16, 0.22, 0.32, 1] }
          }
        />

        {/* vault tiles — the erased one dissolves and regrows; the rest hold */}
        {VAULT_TILES.map((fill, i) => (
          <m.rect
            key={i}
            x={tileX(i)}
            y={tileY(i)}
            width={TILE}
            height={TILE}
            rx={6}
            fill={fill}
            fillOpacity={0.8}
            initial={{ opacity: 1, scale: 1 }}
            animate={
              i === ERASE_INDEX
                ? reduced
                  ? { opacity: 0.35, scale: 0.9 }
                  : { opacity: [1, 1, 0, 0, 1], scale: [1, 1, 0.6, 0.6, 1] }
                : { opacity: 1, scale: 1 }
            }
            transition={
              i === ERASE_INDEX && !reduced
                ? {
                    duration: CYCLE,
                    repeat: Infinity,
                    ease: [0.22, 0.61, 0.36, 1],
                    times: [0, 0.66, 0.74, 0.9, 0.98],
                  }
                : { duration: 0 }
            }
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          />
        ))}

        {/* beat 1 — the access request arrives (rose, from the left) */}
        <m.circle
          cx={24}
          cy={VAULT.y + VAULT.h / 2}
          r={4.5}
          fill="var(--rose)"
          initial={{ x: 0, opacity: 0 }}
          animate={
            reduced
              ? { x: REQUEST_DELTA, opacity: 0.9 }
              : { x: [0, REQUEST_DELTA], opacity: [0, 1, 1, 0] }
          }
          transition={
            reduced
              ? { duration: 0 }
              : {
                  duration: CYCLE,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  times: [0.02, 0.2],
                  opacity: { duration: CYCLE, repeat: Infinity, times: [0, 0.06, 0.24, 0.3] },
                }
          }
        />

        {/* beat 2 — the export copy leaves; the original stays (outlined twin) */}
        <m.rect
          x={tileX(EXPORT_INDEX)}
          y={tileY(EXPORT_INDEX)}
          width={TILE}
          height={TILE}
          rx={6}
          fill="none"
          stroke="var(--clay)"
          strokeWidth={1.5}
          initial={{ x: 0, y: 0, opacity: 0 }}
          animate={
            reduced
              ? { x: EXPORT_DELTA * 0.75, y: -14, opacity: 0.8 }
              : { x: [0, EXPORT_DELTA], y: [0, -18], opacity: [0, 0.9, 0.9, 0] }
          }
          transition={
            reduced
              ? { duration: 0 }
              : {
                  duration: CYCLE,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  times: [0.36, 0.6],
                  opacity: { duration: CYCLE, repeat: Infinity, times: [0.34, 0.4, 0.56, 0.62] },
                }
          }
        />
      </svg>

      {/* the ledger — three rights, article numbers on inspection (HTML, never SVG text) */}
      <div className="text-label text-faint-foreground mt-3 flex items-center justify-center gap-6">
        {RIGHTS.map((right) => (
          <span key={right.label} className="inline-flex items-baseline gap-1.5">
            <span className={cn('transition-colors duration-200', reading && 'text-foreground')}>
              {right.label}
            </span>
            <span
              className={cn(
                'transition-opacity duration-200 tabular-nums',
                reading ? 'opacity-100' : 'opacity-0',
              )}
            >
              {right.article}
            </span>
          </span>
        ))}
      </div>
      <p className="text-label text-faint-foreground mt-4 text-center">
        request in · copy out · erased on request
      </p>
    </div>
  );
}
