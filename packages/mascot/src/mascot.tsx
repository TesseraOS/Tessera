'use client';

/**
 * The Mascot rig (ADR-0046) — renders Tess as inline SVG.
 *
 * Structural invariants (tested):
 * - The DOM shape is IDENTICAL for every mood and every client state; only attribute
 *   values (inline custom properties, data-*) vary. Server markup therefore never
 *   depends on client conditions — the hydration-mismatch class is impossible here.
 * - All motion lives in styles.css (transform/opacity, the house ease, budgets from
 *   THERMAL); `prefers-reduced-motion` freezes everything into the mood's designed
 *   still pose. This component holds no animation state beyond the one-shot re-seat.
 * - Colors resolve through the closed `--mascot-*` contract; unbound consumers get a
 *   monochrome `currentColor` figure.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { SLOTS, SLOT_SPECS, TILE, TILE_RADIUS, VIEWBOX } from './geometry.js';
import { MOODS, THERMAL, isMoodName } from './moods.js';
import type { MoodDefinition, MoodName } from './moods.js';

/** Smallest rendered size at which the figure stays legible (tested). */
export const MIN_SIZE = 24;
/** Default rendered size, px. */
export const DEFAULT_SIZE = 96;

export interface MascotProps {
  /** A predefined mood name, or a custom definition built with `defineMood()`. */
  mood?: MoodName | MoodDefinition;
  /** Rendered edge length in px (square). Clamped to ≥{@link MIN_SIZE}. */
  size?: number;
  /**
   * Accessible name. Absent ⇒ the SVG is decorative (`aria-hidden`). Required when
   * `interactive` — a control must have a name.
   */
  title?: string;
  /** Wrap Tess in a real button; click plays the one-shot re-seat gesture. */
  interactive?: boolean;
  /** Called on activation (only meaningful with `interactive`). */
  onActivate?: () => void;
  className?: string;
}

function resolveMood(mood: MoodName | MoodDefinition): MoodDefinition {
  if (typeof mood === 'string') {
    if (!isMoodName(mood)) {
      throw new Error(
        `@tessera/mascot: unknown mood "${mood}" — predefined moods are ${Object.keys(MOODS).join(
          ', ',
        )}; build custom moods with defineMood().`,
      );
    }
    return MOODS[mood];
  }
  return mood;
}

/* Breath intensity (0–1) → the ember glow's opacity swing. */
const breathLo = (intensity: number): number => 0.08 + 0.06 * intensity;
const breathHi = (intensity: number): number => 0.16 + 0.22 * intensity;

export function Mascot({
  mood = 'idle',
  size = DEFAULT_SIZE,
  title,
  interactive = false,
  onActivate,
  className,
}: MascotProps): ReactElement {
  const def = resolveMood(mood);
  if (interactive && !title) {
    throw new Error('@tessera/mascot: an interactive Tess requires a title (its accessible name).');
  }
  const edge = Math.max(MIN_SIZE, Math.round(size));

  const [reseat, setReseat] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleActivate = useCallback(() => {
    // One-shot: absorbed while playing (CSS restarts only on attribute re-match).
    setReseat(true);
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = setTimeout(() => setReseat(false), THERMAL.oneShotMs + 100);
    onActivate?.();
  }, [onActivate]);
  useEffect(
    () => () => {
      if (timer.current !== undefined) clearTimeout(timer.current);
    },
    [],
  );

  const rootVars = {
    '--tess-breath-period': `${def.rhythm.breathPeriodMs}ms`,
    '--tess-breath-lo': String(breathLo(def.rhythm.breathIntensity)),
    '--tess-breath-hi': String(breathHi(def.rhythm.breathIntensity)),
    '--tess-drift-amp': `${-def.rhythm.driftAmp}px`,
  } as CSSProperties;

  const svg = (
    <svg
      viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
      width={edge}
      height={edge}
      className={interactive ? 'tess' : className ? `tess ${className}` : 'tess'}
      style={rootVars}
      data-tess=""
      data-mood={def.name}
      data-reseat={reseat ? 'true' : undefined}
      aria-hidden={interactive || !title ? true : undefined}
      role={!interactive && title ? 'img' : undefined}
      aria-label={!interactive && title ? title : undefined}
      focusable="false"
    >
      <g className="tess-figure">
        {SLOTS.map((slot, index) => {
          const spec = SLOT_SPECS[slot];
          const pose = def.poses[slot];
          const slotVars = {
            '--tess-tx': `${pose.dx}px`,
            '--tess-ty': `${pose.dy}px`,
            '--tess-rot': `${pose.rotate}deg`,
            '--tess-scale': String(pose.scale),
            '--tess-op': String(pose.opacity),
            '--tess-i': String(index),
          } as CSSProperties;
          return (
            <g key={slot} className="tess-slot" data-slot={slot} style={slotVars}>
              <g className="tess-drift">
                {slot === 'heart' ? (
                  <>
                    <rect
                      className="tess-ember"
                      x={spec.x - 3}
                      y={spec.y - 3}
                      width={TILE + 6}
                      height={TILE + 6}
                      rx={TILE_RADIUS + 1.5}
                    />
                    <rect
                      className="tess-ember-hover"
                      x={spec.x - 3}
                      y={spec.y - 3}
                      width={TILE + 6}
                      height={TILE + 6}
                      rx={TILE_RADIUS + 1.5}
                    />
                  </>
                ) : null}
                <rect
                  className="tess-tile"
                  data-role={pose.role}
                  x={spec.x}
                  y={spec.y}
                  width={TILE}
                  height={TILE}
                  rx={TILE_RADIUS}
                />
              </g>
            </g>
          );
        })}
        <rect className="tess-sheen" x={39} y={-20} width={TILE} height={VIEWBOX + 40} rx={4} />
      </g>
    </svg>
  );

  if (!interactive) return svg;
  return (
    <button
      type="button"
      className={className ? `tess-button ${className}` : 'tess-button'}
      aria-label={title}
      onClick={handleActivate}
    >
      {svg}
    </button>
  );
}
