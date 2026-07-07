'use client';

import { useRef, useState } from 'react';
import { m, thermalEase, useReducedMotion } from '@/lib/motion';

/**
 * CompilerAssembly (MARKETING-DESIGN §3.6): scattered fragments settle into the mosaic —
 * retrieve, rank, compress — and the gilded tile completes it while the token meter
 * counts what survived the budget. Brand art, not UI chrome. Plays once in view.
 */

const GRID = [
  { x: 0, y: 0, o: 0.55 },
  { x: 66, y: 0, o: 0.8 },
  { x: 0, y: 66, o: 0.8 },
  { x: 66, y: 66, o: 1 },
  { x: 132, y: 66, o: 0.9 },
  { x: 0, y: 132, o: 0.45 },
  { x: 66, y: 132, o: 0.9 },
  { x: 132, y: 132, o: 0.7 },
] as const;

/* Where each tile starts: scattered, tilted — the unretrieved pile. */
const SCATTER = [
  { dx: -90, dy: -40, r: -14 },
  { dx: 60, dy: -70, r: 10 },
  { dx: -110, dy: 40, r: 8 },
  { dx: 90, dy: 90, r: -6 },
  { dx: 120, dy: -30, r: 16 },
  { dx: -60, dy: 120, r: -12 },
  { dx: 40, dy: 140, r: 6 },
  { dx: 140, dy: 60, r: -10 },
] as const;

const BUDGET = 8000;
const COMPILED = 6148;

export function CompilerAssembly() {
  const reduced = useReducedMotion();
  const [count, setCount] = useState(reduced ? COMPILED : 0);
  const started = useRef(false);

  const startCount = () => {
    if (started.current) return;
    started.current = true;
    if (reduced) {
      setCount(COMPILED);
      return;
    }
    const t0 = performance.now();
    const duration = 1100;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - (1 - p) ** 3;
      setCount(Math.round(COMPILED * eased));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  return (
    <m.div
      role="img"
      aria-label="Scattered context fragments assemble into a compact mosaic; the token meter shows 6,148 of an 8,000-token budget used, every fragment cited"
      className="grid items-center gap-10 sm:grid-cols-2"
      onViewportEnter={startCount}
      viewport={{ once: true, amount: 0.4 }}
    >
      <svg viewBox="-40 -40 280 280" className="mx-auto w-full max-w-xs" aria-hidden="true">
        {GRID.map((tile, index) => (
          <m.rect
            key={index}
            className="tf-box"
            initial={{
              x: SCATTER[index]?.dx ?? 0,
              y: SCATTER[index]?.dy ?? 0,
              rotate: SCATTER[index]?.r ?? 0,
              opacity: 0.25,
            }}
            whileInView={{ x: 0, y: 0, rotate: 0, opacity: tile.o }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.9, delay: 0.08 * index, ease: thermalEase }}
            width={54}
            height={54}
            rx={12}
            fill="var(--foreground)"
            transform={`translate(${tile.x}, ${tile.y})`}
          />
        ))}
        {/* the empty seat, then the gilded arrival */}
        <rect
          x={135}
          y={3}
          width={48}
          height={48}
          rx={10}
          fill="none"
          stroke="var(--foreground)"
          strokeOpacity={0.3}
          strokeWidth={1.5}
        />
        <m.rect
          className="tf-box"
          initial={{ x: 46, y: -46, opacity: 0 }}
          whileInView={{ x: 0, y: 0, opacity: 1 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.8, delay: 0.85, ease: thermalEase }}
          width={54}
          height={54}
          rx={12}
          fill="var(--gold)"
          transform="translate(132, 0)"
        />
      </svg>

      <div aria-hidden="true">
        <p className="font-serif text-title text-foreground tabular-nums">
          {count.toLocaleString('en-US')}
        </p>
        <p className="text-label text-faint-foreground mt-1 font-mono">
          of {BUDGET.toLocaleString('en-US')} tokens · every fragment cited
        </p>
        <div className="bg-secondary mt-5 h-1 w-full max-w-56 overflow-hidden rounded-full">
          <m.div
            className="bg-rose h-full origin-left rounded-full"
            style={{ width: `${(COMPILED / BUDGET) * 100}%` }}
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 1, delay: 0.5, ease: thermalEase }}
          />
        </div>
        <dl className="mt-6 grid max-w-64 grid-cols-3 gap-3">
          <div>
            <dt className="text-label text-faint-foreground font-mono">found</dt>
            <dd className="text-body text-muted-foreground mt-0.5 tabular-nums">214</dd>
          </div>
          <div>
            <dt className="text-label text-faint-foreground font-mono">ranked</dt>
            <dd className="text-body text-muted-foreground mt-0.5 tabular-nums">47</dd>
          </div>
          <div>
            <dt className="text-label text-faint-foreground font-mono">kept</dt>
            <dd className="text-body text-foreground mt-0.5 tabular-nums">12</dd>
          </div>
        </dl>
      </div>
    </m.div>
  );
}
