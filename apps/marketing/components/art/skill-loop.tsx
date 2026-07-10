'use client';

import { m, useReducedMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * SkillLoop (MARKETING-DESIGN §3.12, ADR-0045 v4.5) — the skills hero's signature art:
 * the discipline every first-party skill teaches, drawn as a ring a context packet
 * travels forever — compile context, check effects, edit, capture memory, around again.
 * Four stations warm as the packet reaches them; the Tessera mark sits at the center
 * (its gilded tile is this band's gold moment). Constant-derived geometry; one shared
 * clock; transform/opacity motion only; frozen under reduced motion.
 */

const SIZE = 320;
const CENTER = SIZE / 2;
const RING_R = 112;
const STATION = 34;
const CYCLE = 12;

/** Stations clockwise from the top (chip = the HTML label's seat); the packet starts at the top. */
const STATIONS = [
  {
    label: 'compile_context',
    angle: -90,
    chip: { left: '50%', top: '0%', translate: '-50% 0' },
  },
  {
    label: 'get_effects',
    angle: 0,
    chip: { left: '100%', top: '50%', translate: '-100% -50%' },
  },
  {
    label: 'edit',
    angle: 90,
    chip: { left: '50%', top: '100%', translate: '-50% -100%' },
  },
  {
    label: 'capture_memory',
    angle: 180,
    chip: { left: '0%', top: '50%', translate: '0 -50%' },
  },
] as const;

const stationPoint = (angle: number) => ({
  x: CENTER + RING_R * Math.cos((angle * Math.PI) / 180),
  y: CENTER + RING_R * Math.sin((angle * Math.PI) / 180),
});

/** Center mark: a 2×2 tessera with the gilded fragment arriving home. */
const TILE = 20;
const GAP = 5;
const MARK = TILE * 2 + GAP;
const MARK_X = CENTER - MARK / 2;
const MARK_Y = CENTER - MARK / 2;
const MARK_FILLS = ['var(--clay)', 'var(--secondary)', 'var(--burgundy)', 'var(--gold)'] as const;

interface SkillLoopProps {
  className?: string;
}

export function SkillLoop({ className }: SkillLoopProps) {
  const reduced = useReducedMotion();

  return (
    <div
      role="img"
      aria-label="A context packet travels a ring through four stations — compile context, check effects, edit, capture memory — and around again: the loop every Tessera skill teaches an agent. Decorative animation; still under reduced motion."
      className={cn('relative mx-auto w-full max-w-sm', className)}
    >
      <div className="relative px-12 py-8">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-auto w-full" aria-hidden="true">
          {/* the ring — this band's ambient system is its slow dash drift. One element
              for BOTH motion modes: branching SSR'd markup on useReducedMotion()
              hydration-mismatches; only animate/transition may vary. */}
          <m.g
            initial={{ rotate: 0 }}
            animate={{ rotate: reduced ? 0 : 360 }}
            transition={
              reduced ? { duration: 0 } : { duration: CYCLE * 8, repeat: Infinity, ease: 'linear' }
            }
            style={{ transformOrigin: `${CENTER}px ${CENTER}px`, transformBox: 'view-box' }}
          >
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RING_R}
              fill="none"
              stroke="var(--border-strong)"
              strokeWidth={1}
              strokeDasharray="3 7"
            />
          </m.g>

          {/* stations — each warms as the packet reaches it (quarter offsets of the clock) */}
          {STATIONS.map((station, i) => {
            const point = stationPoint(station.angle);
            const arrive = i / STATIONS.length;
            return (
              <g key={station.label}>
                <rect
                  x={point.x - STATION / 2}
                  y={point.y - STATION / 2}
                  width={STATION}
                  height={STATION}
                  rx={8}
                  fill="var(--card)"
                  stroke="var(--border-strong)"
                  strokeWidth={1}
                />
                <m.rect
                  x={point.x - STATION / 2}
                  y={point.y - STATION / 2}
                  width={STATION}
                  height={STATION}
                  rx={8}
                  fill="var(--rose)"
                  initial={{ opacity: 0.1 }}
                  animate={
                    reduced ? { opacity: i === 0 ? 0.35 : 0.12 } : { opacity: [0.1, 0.45, 0.1] }
                  }
                  transition={
                    reduced
                      ? { duration: 0 }
                      : {
                          duration: CYCLE,
                          repeat: Infinity,
                          ease: 'easeInOut',
                          times: [Math.max(0, arrive - 0.07), arrive, Math.min(1, arrive + 0.09)],
                        }
                  }
                />
              </g>
            );
          })}

          {/* the center mark — the gilded fragment is the band's gold moment */}
          {MARK_FILLS.map((fill, i) => (
            <rect
              key={i}
              x={MARK_X + (i % 2) * (TILE + GAP)}
              y={MARK_Y + Math.floor(i / 2) * (TILE + GAP)}
              width={TILE}
              height={TILE}
              rx={5}
              fill={fill}
              fillOpacity={fill === 'var(--gold)' ? 0.95 : 0.8}
            />
          ))}

          {/* the traveling context packet */}
          <m.g
            initial={{ rotate: 0 }}
            animate={{ rotate: reduced ? 0 : 360 }}
            transition={
              reduced ? { duration: 0 } : { duration: CYCLE, repeat: Infinity, ease: 'linear' }
            }
            style={{ transformOrigin: `${CENTER}px ${CENTER}px`, transformBox: 'view-box' }}
          >
            <circle cx={CENTER} cy={CENTER - RING_R} r={5} fill="var(--rose)" opacity={0.95} />
          </m.g>
        </svg>

        {/* station names — HTML chips, never SVG text */}
        {STATIONS.map((station) => (
          <span
            key={station.label}
            aria-hidden="true"
            className="text-label text-faint-foreground bg-background/70 absolute rounded-md px-2 py-0.5 whitespace-nowrap"
            style={{
              left: station.chip.left,
              top: station.chip.top,
              translate: station.chip.translate,
            }}
          >
            {station.label}
          </span>
        ))}
      </div>
      <p className="text-label text-faint-foreground mt-2 text-center">
        the loop every skill teaches
      </p>
    </div>
  );
}
