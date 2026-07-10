'use client';

import { useEffect, useState } from 'react';
import { m, useReducedMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * TenantPerimeter (MARKETING-DESIGN §3.12, ADR-0045 v4.5) — the enterprise hero's
 * signature art: two tenant islands, each a mosaic with its own traffic orbiting
 * INSIDE a hairline perimeter. Once per cycle a packet from tenant A runs at the
 * boundary and is refused — the neighbor's perimeter warms rose for a beat, the packet
 * returns, and the ledger below tallies the attempt (live, like GovernanceGate's).
 * Constant-derived geometry; one shared clock; transforms/opacity only; frozen under
 * reduced motion with the ledger at its end-of-cycle truth.
 */

/* ---- constant-derived scene: two islands, one refused crossing ---- */
const ISLAND_W = 190;
const ISLAND_H = 168;
const ISLAND_Y = 28;
const A_X = 14;
const B_X = 254;
const SCENE_W = B_X + ISLAND_W + 14;
const SCENE_H = ISLAND_Y + ISLAND_H + 30;

const TILE = 22;
const GAP = 6;
/** 2×2 mosaic centered in an island. */
const MOSAIC = TILE * 2 + GAP;
const mosaicOrigin = (islandX: number) => ({
  x: islandX + (ISLAND_W - MOSAIC) / 2,
  y: ISLAND_Y + (ISLAND_H - MOSAIC) / 2,
});

const A_CENTER = { x: A_X + ISLAND_W / 2, y: ISLAND_Y + ISLAND_H / 2 };
const B_CENTER = { x: B_X + ISLAND_W / 2, y: ISLAND_Y + ISLAND_H / 2 };

/** The runner starts beside A's mosaic and is refused at B's west wall. */
const RUN_START_X = A_CENTER.x + MOSAIC / 2 + 14;
const RUN_WALL_X = B_X - 7;
const RUN_DELTA = RUN_WALL_X - RUN_START_X;

/** One shared cycle; the refusal lands mid-cycle. */
const CYCLE = 8;
const REFUSED_AT = 0.52;

const ORBITS = [
  { center: A_CENTER, radius: 62, duration: CYCLE, from: 0 },
  { center: A_CENTER, radius: 44, duration: CYCLE * 0.75, from: 140 },
  { center: B_CENTER, radius: 62, duration: CYCLE * 1.25, from: 40 },
  { center: B_CENTER, radius: 46, duration: CYCLE * 0.85, from: 250 },
] as const;

function IslandMosaic({ islandX, gilded }: { islandX: number; gilded?: boolean }) {
  const { x, y } = mosaicOrigin(islandX);
  const fills = gilded
    ? ['var(--clay)', 'var(--gold)', 'var(--burgundy)', 'var(--secondary)']
    : ['var(--burgundy)', 'var(--secondary)', 'var(--clay)', 'var(--secondary)'];
  return (
    <>
      {fills.map((fill, i) => (
        <rect
          key={i}
          x={x + (i % 2) * (TILE + GAP)}
          y={y + Math.floor(i / 2) * (TILE + GAP)}
          width={TILE}
          height={TILE}
          rx={5}
          fill={fill}
          fillOpacity={0.8}
        />
      ))}
    </>
  );
}

interface TenantPerimeterProps {
  className?: string;
}

export function TenantPerimeter({ className }: TenantPerimeterProps) {
  const reduced = useReducedMotion();
  const [attempts, setAttempts] = useState(1);

  /* The ledger tallies what the scene has actually shown this cycle. */
  useEffect(() => {
    if (reduced) {
      setAttempts(1);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const p = (((now - t0) / 1000) % CYCLE) / CYCLE;
      const next = p >= REFUSED_AT ? 1 : 0;
      setAttempts((prev) => (prev === next ? prev : next));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  return (
    <div
      role="img"
      aria-label="Two tenant islands, each with its own traffic orbiting inside a hairline perimeter. A packet from one tenant runs at the neighbor's boundary and is refused — the perimeter holds, the packet returns, and the ledger logs the attempt. Isolation by construction; the tally shown is simulated demo data."
      className={cn('w-full', className)}
    >
      <svg viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} className="h-auto w-full" aria-hidden="true">
        {/* island grounds + perimeters */}
        {[A_X, B_X].map((x) => (
          <rect
            key={x}
            x={x}
            y={ISLAND_Y}
            width={ISLAND_W}
            height={ISLAND_H}
            rx={14}
            fill="var(--card)"
            fillOpacity={0.55}
            stroke="var(--border-strong)"
            strokeWidth={1}
          />
        ))}

        <IslandMosaic islandX={A_X} gilded />
        <IslandMosaic islandX={B_X} />

        {/* in-perimeter traffic: packets orbit their OWN tenant, never another's.
            One element per packet for BOTH motion modes — branching SSR'd markup on
            useReducedMotion() hydration-mismatches; only animate/transition vary. */}
        {ORBITS.map((orbit, i) => (
          <m.g
            key={i}
            initial={{ rotate: orbit.from }}
            animate={{ rotate: reduced ? orbit.from : orbit.from + 360 }}
            transition={
              reduced
                ? { duration: 0 }
                : { duration: orbit.duration, repeat: Infinity, ease: 'linear' }
            }
            style={{
              transformOrigin: `${orbit.center.x}px ${orbit.center.y}px`,
              transformBox: 'view-box',
            }}
          >
            <circle
              cx={orbit.center.x + orbit.radius}
              cy={orbit.center.y}
              r={4}
              fill="var(--clay)"
              opacity={0.85}
            />
          </m.g>
        ))}

        {/* the refused crossing + the neighbor's perimeter holding */}
        <m.circle
          cx={RUN_START_X}
          cy={A_CENTER.y}
          r={5}
          fill="var(--rose)"
          initial={{ x: 0, opacity: 0 }}
          animate={
            reduced
              ? { x: RUN_DELTA - 10, opacity: 0.9 }
              : { x: [0, RUN_DELTA, RUN_DELTA - 10, 0], opacity: [0, 1, 1, 1, 0] }
          }
          transition={
            reduced
              ? { duration: 0 }
              : {
                  duration: CYCLE,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  times: [0.3, REFUSED_AT, 0.6, 0.86],
                  opacity: {
                    duration: CYCLE,
                    repeat: Infinity,
                    times: [0.28, 0.34, 0.5, 0.8, 0.88],
                  },
                }
          }
        />
        <m.rect
          x={B_X}
          y={ISLAND_Y}
          width={ISLAND_W}
          height={ISLAND_H}
          rx={14}
          fill="none"
          stroke="var(--rose)"
          strokeWidth={1.5}
          initial={{ opacity: 0 }}
          animate={reduced ? { opacity: 0 } : { opacity: [0, 0, 0.9, 0, 0] }}
          transition={
            reduced
              ? { duration: 0 }
              : {
                  duration: CYCLE,
                  repeat: Infinity,
                  times: [0, REFUSED_AT - 0.03, REFUSED_AT + 0.02, REFUSED_AT + 0.12, 1],
                }
          }
        />
      </svg>

      {/* island names + the live ledger (HTML, never SVG text) */}
      <div className="text-label text-faint-foreground mt-3 flex items-center justify-between gap-4">
        <span className="w-1/2 text-center">tenant a</span>
        <span className="w-1/2 text-center">tenant b</span>
      </div>
      <p className="text-label text-faint-foreground mt-4 text-center tabular-nums">
        {attempts} crossing {attempts === 1 ? 'attempt' : 'attempts'} · 0 crossings · all of it
        logged
      </p>
    </div>
  );
}
