'use client';

import { useEffect, useRef, useState } from 'react';
import { m, thermalEase, useReducedMotion } from '@/lib/motion';

/**
 * CompilerAssembly (MARKETING-DESIGN §3.7, ADR-0045 v4.1): scattered fragments gather
 * into the mosaic and drift apart again — an endless breath (assemble → hold →
 * disperse → hold), every position inside the viewBox so nothing ever clips. The token
 * meter counts once in view; captions are HTML on the type scale.
 */

const CELL = 46;
const GAP = 10;
const ORIGIN_X = 150;
const ORIGIN_Y = 51;

/** Final grid seats (3 columns; the top-right seat stays empty for the gilded tile). */
const GRID = [
  { col: 0, row: 0, o: 0.55 },
  { col: 1, row: 0, o: 0.8 },
  { col: 0, row: 1, o: 0.8 },
  { col: 1, row: 1, o: 1 },
  { col: 2, row: 1, o: 0.9 },
  { col: 0, row: 2, o: 0.45 },
  { col: 1, row: 2, o: 0.9 },
  { col: 2, row: 2, o: 0.7 },
] as const;

/** Where each tile rests while dispersed — all inside the canvas, left of the grid. */
const SCATTER = [
  { x: 18, y: 28, r: -12 },
  { x: 84, y: 14, r: 9 },
  { x: 26, y: 96, r: -7 },
  { x: 12, y: 168, r: 10 },
  { x: 90, y: 148, r: -14 },
  { x: 46, y: 208, r: 7 },
  { x: 102, y: 62, r: 12 },
  { x: 64, y: 118, r: -9 },
] as const;

const BUDGET = 8000;
const COMPILED = 6148;

const seat = (col: number, row: number) => ({
  x: ORIGIN_X + col * (CELL + GAP),
  y: ORIGIN_Y + row * (CELL + GAP),
});

/** assemble → hold → disperse → hold, forever (reverse ping-pong). */
const breathe = (index: number) => ({
  duration: 3,
  ease: thermalEase,
  delay: index * 0.1,
  repeat: Infinity,
  repeatType: 'reverse' as const,
  repeatDelay: 1.6,
});

/* The shared breath: travel + hold, mirrored — must match breathe()'s parameters. */
const TRAVEL = 3;
const HOLD = 1.6;
const BREATH_CYCLE = (TRAVEL + HOLD) * 2;

const easeInOutCubic = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);

export function CompilerAssembly() {
  const reduced = useReducedMotion();
  // Never branch initial STATE on `reduced` — the server always renders the
  // non-reduced value and a reduced client would hydration-mismatch the meter text.
  const [count, setCount] = useState(0);
  const started = useRef(false);
  const rafRef = useRef(0);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  /* The meter breathes on the SAME clock as the tiles: fill while they assemble,
     hold, drain while they disperse. One rAF; state only changes when the digit does. */
  const startCount = () => {
    if (started.current) return;
    started.current = true;
    if (reduced) {
      setCount(COMPILED);
      return;
    }
    const t0 = performance.now();
    const stepFrame = (now: number) => {
      const t = ((now - t0) / 1000) % BREATH_CYCLE;
      let fraction: number;
      if (t < TRAVEL) fraction = easeInOutCubic(t / TRAVEL);
      else if (t < TRAVEL + HOLD) fraction = 1;
      else if (t < TRAVEL + HOLD + TRAVEL)
        fraction = 1 - easeInOutCubic((t - TRAVEL - HOLD) / TRAVEL);
      else fraction = 0;
      const next = Math.round(COMPILED * fraction);
      setCount((prev) => (prev === next ? prev : next));
      rafRef.current = requestAnimationFrame(stepFrame);
    };
    rafRef.current = requestAnimationFrame(stepFrame);
  };

  const gildedSeat = seat(2, 0);

  return (
    <m.div
      role="img"
      aria-label="Scattered context fragments assemble into a compact mosaic and drift apart again; the token meter shows 6,148 of an 8,000-token budget used, every fragment cited"
      className="grid items-center gap-10 sm:grid-cols-2"
      onViewportEnter={startCount}
      viewport={{ once: true, amount: 0.4 }}
    >
      <svg viewBox="0 0 320 262" className="mx-auto w-full max-w-sm" aria-hidden="true">
        {GRID.map((tile, index) => {
          const rest = seat(tile.col, tile.row);
          const from = SCATTER[index] ?? { x: 20, y: 20, r: 0 };
          /*
           * Geometry attrs carry the seat; framer's x/y are CSS-translate DELTAS on
           * top (framer overrides the transform attribute on SVG — never combine them).
           * ONE element for both motion modes (branching SSR'd markup on reduced
           * hydration-mismatches); reduced applies the assembled pose instantly.
           */
          return (
            <m.rect
              key={index}
              className="tf-box"
              x={rest.x}
              y={rest.y}
              initial={{ x: from.x - rest.x, y: from.y - rest.y, rotate: from.r, opacity: 0.4 }}
              animate={{ x: 0, y: 0, rotate: 0, opacity: tile.o }}
              transition={reduced ? { duration: 0 } : breathe(index)}
              width={CELL}
              height={CELL}
              rx={11}
              fill="var(--foreground)"
            />
          );
        })}

        {/* the empty seat, and the gilded tile that keeps arriving */}
        <rect
          x={gildedSeat.x + 3}
          y={gildedSeat.y + 3}
          width={CELL - 6}
          height={CELL - 6}
          rx={9}
          fill="none"
          stroke="var(--foreground)"
          strokeOpacity={0.3}
          strokeWidth={1.5}
        />
        <m.rect
          className="tf-box"
          x={gildedSeat.x}
          y={gildedSeat.y}
          initial={{ x: 40, y: -44, opacity: 0 }}
          animate={{ x: 0, y: 0, opacity: 1 }}
          transition={reduced ? { duration: 0 } : breathe(8)}
          width={CELL}
          height={CELL}
          rx={11}
          fill="var(--gold)"
        />
      </svg>

      <div aria-hidden="true">
        <p className="text-title text-foreground font-serif tabular-nums">
          {count.toLocaleString('en-US')}
        </p>
        <p className="text-label text-faint-foreground mt-1">
          of {BUDGET.toLocaleString('en-US')} tokens · every fragment cited
        </p>
        <div className="bg-secondary mt-5 h-1 w-full max-w-56 overflow-hidden rounded-full">
          {/* the budget bar rides the same breath as the digits and the tiles */}
          <div
            className="bg-rose h-full origin-left rounded-full"
            style={{ transform: `scaleX(${count / BUDGET})` }}
          />
        </div>
        <dl className="mt-6 grid max-w-64 grid-cols-3 gap-3">
          <div>
            <dt className="text-label text-faint-foreground">found</dt>
            <dd className="text-body text-muted-foreground mt-0.5 tabular-nums">214</dd>
          </div>
          <div>
            <dt className="text-label text-faint-foreground">ranked</dt>
            <dd className="text-body text-muted-foreground mt-0.5 tabular-nums">47</dd>
          </div>
          <div>
            <dt className="text-label text-foreground">kept</dt>
            <dd className="text-body text-foreground mt-0.5 tabular-nums">12</dd>
          </div>
        </dl>
      </div>
    </m.div>
  );
}
