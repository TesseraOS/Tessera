'use client';

import { useEffect, useState } from 'react';
import { m, useReducedMotion } from '@/lib/motion';

/**
 * GovernanceGate (MARKETING-DESIGN §3.7, ADR-0045 v4.1): requests approach the policy
 * gate on one lane — two pass and take the gilded edge to the served slot, one is
 * turned away into the denied tray (the cross lives inside the tray, never floating).
 * Geometry is constant-derived, so alignment holds by construction; the sequence loops
 * forever on one shared clock. Captions are HTML below the scene.
 */

/* ---- constant-derived geometry: one lane, one gate, one slot, one tray ---- */
const LANE_Y = 110;
const TILE = 30;
const START_X = 36;
const GATE_X = 260;
const PASS_END_X = 448;
const TRAY = { x: 292, y: 184, w: 64, h: 56 };

const TILE_Y = LANE_Y - TILE / 2;
const PASS_DELTA = PASS_END_X - START_X;
const STOP_DELTA = GATE_X - START_X - TILE - 6;
const TRAY_DX = TRAY.x + (TRAY.w - TILE) / 2 - START_X - STOP_DELTA;
const TRAY_DY = TRAY.y + (TRAY.h - TILE) / 2 - TILE_Y;

/** One shared cycle so every actor stays in sync. */
const CYCLE = 7;

const loop = { duration: CYCLE, repeat: Infinity, ease: 'linear' as const };

/* Cycle moments (fractions of CYCLE) when the ledger learns something. */
const LANDS_A = 0.3;
const LANDS_B = 0.46;
const DENIED_AT = 0.68;

export function GovernanceGate() {
  const reduced = useReducedMotion();
  const [tally, setTally] = useState({ allowed: 2, denied: 1 });

  /* The ledger is LIVE: it tallies what the scene has actually shown this cycle. */
  useEffect(() => {
    if (reduced) {
      setTally({ allowed: 2, denied: 1 });
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const p = (((now - t0) / 1000) % CYCLE) / CYCLE;
      const next = {
        allowed: (p >= LANDS_A ? 1 : 0) + (p >= LANDS_B ? 1 : 0),
        denied: p >= DENIED_AT ? 1 : 0,
      };
      setTally((prev) =>
        prev.allowed === next.allowed && prev.denied === next.denied ? prev : next,
      );
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  return (
    <div
      role="img"
      aria-label="Requests approach a policy gate: two pass and continue gilded to the served slot, one is denied and set into the audit tray — all of it logged"
      className="w-full"
    >
      <svg viewBox="0 0 520 260" className="h-auto w-full" aria-hidden="true" focusable="false">
        {/* the lane */}
        <path d={`M20 ${LANE_Y} H 500`} stroke="var(--border)" strokeWidth="1.5" fill="none" />

        {/* the gate */}
        <g fill="var(--foreground)">
          <rect x={GATE_X - 16} y={LANE_Y - 36} width={9} height={72} rx={4} fillOpacity={0.55} />
          <rect x={GATE_X + 7} y={LANE_Y - 36} width={9} height={72} rx={4} fillOpacity={0.55} />
          <rect x={GATE_X - 24} y={LANE_Y - 48} width={48} height={9} rx={4} fillOpacity={0.75} />
        </g>

        {/* the served slot — where allowed context lands */}
        <rect
          x={PASS_END_X}
          y={TILE_Y - 3}
          width={TILE + 6}
          height={TILE + 6}
          rx={9}
          fill="none"
          stroke="var(--gold)"
          strokeOpacity={0.5}
          strokeWidth={1.5}
        />

        {/* the denied tray — the cross belongs inside it */}
        <rect
          x={TRAY.x}
          y={TRAY.y}
          width={TRAY.w}
          height={TRAY.h}
          rx={10}
          fill="var(--foreground)"
          fillOpacity={0.05}
          stroke="var(--border-strong)"
          strokeWidth={1.5}
          strokeDasharray="4 5"
        />
        {/* ONE element per actor for BOTH motion modes — branching SSR'd markup on
            useReducedMotion() hydration-mismatches (the server always renders the
            animated branch); reduced applies each actor's still-frame pose instantly. */}
        <m.path
          d={`M${TRAY.x + TRAY.w / 2 - 7} ${TRAY.y + TRAY.h / 2 - 7} l 14 14 M${TRAY.x + TRAY.w / 2 + 7} ${TRAY.y + TRAY.h / 2 - 7} l -14 14`}
          stroke="var(--rose)"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          initial={{ opacity: 0 }}
          animate={reduced ? { opacity: 1 } : { opacity: [0, 0, 1, 1, 0] }}
          transition={reduced ? { duration: 0 } : { ...loop, times: [0, 0.66, 0.7, 0.94, 1] }}
        />

        {/* allowed tile one — reduced still-frame: landed in the served slot */}
        <m.rect
          className="tf-box"
          x={START_X}
          y={TILE_Y}
          width={TILE}
          height={TILE}
          rx={7}
          fill="var(--foreground)"
          fillOpacity={0.8}
          stroke="var(--gold)"
          strokeWidth={2}
          initial={{ x: 0, opacity: 0, strokeOpacity: 0 }}
          animate={
            reduced
              ? { x: PASS_DELTA, opacity: 1, strokeOpacity: 1 }
              : {
                  x: [0, 0, PASS_DELTA * 0.52, PASS_DELTA, PASS_DELTA],
                  opacity: [0, 1, 1, 1, 0],
                  strokeOpacity: [0, 0, 0, 1, 1],
                }
          }
          transition={reduced ? { duration: 0 } : { ...loop, times: [0, 0.04, 0.17, 0.3, 0.36] }}
        />
        {/* allowed tile two — hidden in the reduced still-frame */}
        <m.rect
          className="tf-box"
          x={START_X}
          y={TILE_Y}
          width={TILE}
          height={TILE}
          rx={7}
          fill="var(--foreground)"
          fillOpacity={0.65}
          stroke="var(--gold)"
          strokeWidth={2}
          initial={{ x: 0, opacity: 0, strokeOpacity: 0 }}
          animate={
            reduced
              ? { x: 0, opacity: 0, strokeOpacity: 0 }
              : {
                  x: [0, 0, PASS_DELTA * 0.52, PASS_DELTA, PASS_DELTA],
                  opacity: [0, 1, 1, 1, 0],
                  strokeOpacity: [0, 0, 0, 1, 1],
                }
          }
          transition={reduced ? { duration: 0 } : { ...loop, times: [0.16, 0.2, 0.33, 0.46, 0.52] }}
        />
        {/* the denied tile — stopped at the gate, set into the tray */}
        <m.rect
          className="tf-box"
          x={START_X}
          y={TILE_Y}
          width={TILE}
          height={TILE}
          rx={7}
          fill="var(--rose)"
          initial={{ x: 0, y: 0, opacity: 0 }}
          animate={
            reduced
              ? { x: STOP_DELTA + TRAY_DX, y: TRAY_DY, opacity: 0.55 }
              : {
                  x: [0, 0, STOP_DELTA, STOP_DELTA, STOP_DELTA + TRAY_DX, STOP_DELTA + TRAY_DX],
                  y: [0, 0, 0, 0, TRAY_DY, TRAY_DY],
                  opacity: [0, 0.9, 0.9, 0.9, 0.55, 0],
                }
          }
          transition={
            reduced ? { duration: 0 } : { ...loop, times: [0.3, 0.34, 0.52, 0.56, 0.68, 1] }
          }
        />
      </svg>

      {/* the record — pushed well below the scene, tallying the cycle as it happens */}
      <p className="text-label text-faint-foreground mt-6 text-right tabular-nums">
        {tally.allowed} allowed · {tally.denied} denied · all of it logged
      </p>
    </div>
  );
}
