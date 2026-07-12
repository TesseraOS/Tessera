'use client';

import { useState } from 'react';
import { m, useReducedMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * RedactionGate (MARKETING-DESIGN §3.14, ADR-0045 v4.10) — the privacy hero's legal
 * signature art: content tiles stream toward persistence through a redaction gate;
 * tiles carrying a secret-shaped mark leave the gate with the mark masked (F-006 —
 * secrets are scrubbed before anything persists; the content itself passes intact).
 * Hover raises an inspection lens on the gate and the scrubbed tally. Constant-derived
 * geometry; one shared clock; transform/opacity only; SSR-deterministic markup (only
 * animate/transition vary with reduced motion); frozen as a designed mid-story scene.
 */

const SCENE_W = 440;
const SCENE_H = 190;
const BELT_Y = 96;
const TILE = 30;
const GATE_X = SCENE_W / 2;
const GATE_W = 10;
const GATE_GAP = 56;

/** Travelers ride from off-canvas left to off-canvas right on one shared clock. */
const START_X = -TILE - 8;
const TRAVEL = SCENE_W - START_X + TILE;
const CYCLE = 7.5;
/** Fraction of the journey where a tile's center crosses the gate. */
const CROSS = (GATE_X - START_X - TILE / 2) / TRAVEL;

/** Three travelers, evenly phased; the middle one carries the secret mark. */
const TRAVELERS = [
  { secret: false, delay: 0, fill: 'var(--secondary)' },
  { secret: true, delay: CYCLE / 3, fill: 'var(--burgundy)' },
  { secret: false, delay: (2 * CYCLE) / 3, fill: 'var(--clay)' },
] as const;

/** Reduced-motion still scene: the whole story at once — a clean tile inbound, the
 * secret tile ALREADY masked past the gate, another inbound behind. */
const STILL_X = [110 - START_X, 320 - START_X, 20 - START_X] as const;

interface LegalRedactionGateProps {
  className?: string;
}

export function LegalRedactionGate({ className }: LegalRedactionGateProps) {
  const reduced = useReducedMotion();
  const [inspecting, setInspecting] = useState(false);

  return (
    <div
      role="img"
      aria-label="Content tiles stream through a redaction gate on their way to persistence; tiles carrying secret-shaped marks leave with the mark masked while the content passes intact — secrets are scrubbed before anything persists. Decorative animation; still under reduced motion."
      className={cn('w-full', className)}
      onPointerEnter={() => setInspecting(true)}
      onPointerLeave={() => setInspecting(false)}
    >
      <svg viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} className="h-auto w-full" aria-hidden="true">
        {/* the belt */}
        <line
          x1={8}
          y1={BELT_Y + TILE / 2 + 10}
          x2={SCENE_W - 8}
          y2={BELT_Y + TILE / 2 + 10}
          stroke="var(--border)"
          strokeWidth={1}
        />

        {/* travelers — one element per tile for BOTH motion modes; geometry attrs
            position, framer animates deltas only */}
        {TRAVELERS.map((traveler, i) => {
          const stillX = STILL_X[i] ?? 0;
          const pastGate = stillX + START_X + TILE / 2 > GATE_X;
          return (
            <m.g
              key={i}
              initial={{ x: 0, opacity: 0 }}
              animate={
                reduced ? { x: stillX, opacity: 1 } : { x: [0, TRAVEL], opacity: [0, 1, 1, 1, 0] }
              }
              transition={
                reduced
                  ? { duration: 0 }
                  : {
                      duration: CYCLE,
                      delay: traveler.delay,
                      repeat: Infinity,
                      ease: 'linear',
                      opacity: {
                        duration: CYCLE,
                        delay: traveler.delay,
                        repeat: Infinity,
                        times: [0, 0.08, 0.5, 0.92, 1],
                      },
                    }
              }
            >
              <rect
                x={START_X}
                y={BELT_Y - TILE / 2}
                width={TILE}
                height={TILE}
                rx={6}
                fill={traveler.fill}
                fillOpacity={0.75}
              />
              {traveler.secret ? (
                <>
                  {/* the secret-shaped mark — visible only BEFORE the gate */}
                  <m.g
                    initial={{ opacity: 1 }}
                    animate={reduced ? { opacity: pastGate ? 0 : 1 } : { opacity: [1, 1, 0, 0] }}
                    transition={
                      reduced
                        ? { duration: 0 }
                        : {
                            duration: CYCLE,
                            delay: traveler.delay,
                            repeat: Infinity,
                            times: [0, CROSS - 0.02, CROSS + 0.03, 1],
                          }
                    }
                  >
                    {[0, 1, 2].map((dot) => (
                      <circle
                        key={dot}
                        cx={START_X + 9 + dot * 6}
                        cy={BELT_Y}
                        r={2.2}
                        fill="var(--rose)"
                      />
                    ))}
                  </m.g>
                  {/* the redaction bar — visible only AFTER the gate */}
                  <m.rect
                    x={START_X + 6}
                    y={BELT_Y - 2.5}
                    width={TILE - 12}
                    height={5}
                    rx={2.5}
                    fill="var(--foreground)"
                    fillOpacity={0.85}
                    initial={{ opacity: 0 }}
                    animate={reduced ? { opacity: pastGate ? 1 : 0 } : { opacity: [0, 0, 1, 1] }}
                    transition={
                      reduced
                        ? { duration: 0 }
                        : {
                            duration: CYCLE,
                            delay: traveler.delay,
                            repeat: Infinity,
                            times: [0, CROSS - 0.01, CROSS + 0.04, 1],
                          }
                    }
                  />
                </>
              ) : (
                <line
                  x1={START_X + 8}
                  y1={BELT_Y}
                  x2={START_X + TILE - 8}
                  y2={BELT_Y}
                  stroke="var(--background)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  opacity={0.65}
                />
              )}
            </m.g>
          );
        })}

        {/* the gate — posts above and below the belt; warms when the secret crosses */}
        {[BELT_Y - GATE_GAP, BELT_Y + GATE_GAP - 44].map((y) => (
          <rect
            key={y}
            x={GATE_X - GATE_W / 2}
            y={y}
            width={GATE_W}
            height={44}
            rx={4}
            fill="var(--card)"
            stroke={inspecting ? 'var(--rose)' : 'var(--border-strong)'}
            strokeWidth={1}
          />
        ))}
        <m.line
          x1={GATE_X}
          y1={BELT_Y - GATE_GAP + 46}
          x2={GATE_X}
          y2={BELT_Y + GATE_GAP - 46}
          stroke="var(--rose)"
          strokeWidth={1.5}
          initial={{ opacity: 0.25 }}
          animate={reduced ? { opacity: 0.5 } : { opacity: [0.25, 0.25, 0.9, 0.25, 0.25] }}
          transition={
            reduced
              ? { duration: 0 }
              : {
                  duration: CYCLE,
                  delay: CYCLE / 3,
                  repeat: Infinity,
                  times: [0, CROSS - 0.03, CROSS, CROSS + 0.08, 1],
                }
          }
        />

        {/* the inspection lens — hover response (thermal ease, transform/opacity only) */}
        <m.circle
          cx={GATE_X}
          cy={BELT_Y}
          r={44}
          fill="none"
          stroke="var(--rose)"
          strokeWidth={1}
          strokeDasharray="4 6"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={inspecting ? { opacity: 0.9, scale: 1 } : { opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.25, ease: [0.22, 0.61, 0.36, 1] }}
          style={{ transformOrigin: `${GATE_X}px ${BELT_Y}px`, transformBox: 'view-box' }}
        />
      </svg>

      {/* stage names + the inspection readout — HTML, never SVG text */}
      <div className="text-label text-faint-foreground mt-3 flex items-center justify-between">
        <span>ingested</span>
        <span
          className={cn(
            'transition-opacity duration-200',
            inspecting ? 'text-foreground opacity-100' : 'opacity-0',
          )}
        >
          patterns scrubbed · content kept
        </span>
        <span>persisted</span>
      </div>
      <p className="text-label text-faint-foreground mt-4 text-center">
        secrets never reach storage
      </p>
    </div>
  );
}
