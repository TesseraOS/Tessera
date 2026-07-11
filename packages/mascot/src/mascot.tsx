'use client';

/**
 * The Mascot rig (ADR-0046 v3) — renders Tess as inline SVG.
 *
 * Structural invariants (tested):
 * - The DOM shape is IDENTICAL for every mood and every client state: all pieces AND all
 *   mood props (mini knowledge graph, work bench, confetti, the loose tile) are always
 *   rendered; `[data-mood]` CSS shows the relevant prop and drives its activity loop.
 *   Server markup therefore never depends on client conditions.
 * - Activities (typing, scanning, waving, cheering), breath/bob, blink and gestures live
 *   in styles.css; the only JS-driven motion is the pointer-following gaze (a rAF spring
 *   writing `--tess-look-*` onto the gaze group — an element React renders WITHOUT a
 *   style prop, so re-renders never wipe the JS-set vars) and the one-shot delight
 *   reaction (`data-react`).
 * - Reduced motion disables gaze, wander, and reactions entirely (CSS freezes the rest);
 *   the mood's pose is the designed still frame.
 * - Colors resolve through the closed `--mascot-*` contract; unbound consumers get a
 *   monochrome `currentColor` figure.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { BLUSH, EYE, GAZE_MAX, HEAD_CENTER, PROPS, SLOTS, SLOT_SPECS } from './geometry.js';
import { VIEWBOX } from './geometry.js';
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
  /**
   * Liveliness (default ON): eyes follow the pointer (wandering when idle) and a
   * click/tap plays the one-shot delight reaction. Keyboard-neutral — decorative
   * placements gain NO tab stop. Disabled automatically under reduced motion.
   */
  reactive?: boolean;
  /** Wrap Tess in a real button (a genuine control with a tab stop). */
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

/* Breath intensity (0–1) → the ember glow's opacity swing (visible, never a strobe). */
const breathLo = (intensity: number): number => 0.1 + 0.08 * intensity;
const breathHi = (intensity: number): number => 0.2 + 0.25 * intensity;

const clamp = (value: number, limit: number): number => Math.max(-limit, Math.min(limit, value));

export function Mascot({
  mood = 'idle',
  size = DEFAULT_SIZE,
  title,
  reactive = true,
  interactive = false,
  onActivate,
  className,
}: MascotProps): ReactElement {
  const def = resolveMood(mood);
  if (interactive && !title) {
    throw new Error('@tessera/mascot: an interactive Tess requires a title (its accessible name).');
  }
  const edge = Math.max(MIN_SIZE, Math.round(size));

  const svgRef = useRef<SVGSVGElement | null>(null);
  const gazeRef = useRef<SVGGElement | null>(null);

  /* Reduced motion gates every JS behavior (markup is identical either way). */
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  /* The one-shot delight reaction (click/tap; absorbed while playing). */
  const [reacting, setReacting] = useState(false);
  const reactTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const playDelight = useCallback(() => {
    if (reducedMotion) return;
    setReacting(true);
    if (reactTimer.current !== undefined) clearTimeout(reactTimer.current);
    reactTimer.current = setTimeout(() => setReacting(false), THERMAL.oneShotMs + 120);
  }, [reducedMotion]);
  useEffect(
    () => () => {
      if (reactTimer.current !== undefined) clearTimeout(reactTimer.current);
    },
    [],
  );

  /*
   * The gaze: eyes spring toward the pointer; when the pointer has been quiet, Tess
   * glances at random spots instead (the attention-seeker). Writes only CSS vars on the
   * gaze group — no layout, no React state, transform-only.
   */
  useEffect(() => {
    if (!reactive || reducedMotion) return undefined;
    const svg = svgRef.current;
    const gaze = gazeRef.current;
    if (!svg || !gaze) return undefined;

    const look = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    let raf = 0;
    let wander: ReturnType<typeof setTimeout> | undefined;
    let lastPointer = 0;

    const tick = () => {
      look.x += (target.x - look.x) * 0.16;
      look.y += (target.y - look.y) * 0.16;
      gaze.style.setProperty('--tess-look-x', `${look.x.toFixed(2)}px`);
      gaze.style.setProperty('--tess-look-y', `${look.y.toFixed(2)}px`);
      if (Math.abs(target.x - look.x) + Math.abs(target.y - look.y) > 0.02) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0;
      }
    };
    const startLoop = () => {
      if (raf === 0) raf = requestAnimationFrame(tick);
    };

    const onPointerMove = (event: PointerEvent) => {
      lastPointer = Date.now();
      const rect = svg.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      target.x = clamp(dx / 160, 1) * GAZE_MAX;
      target.y = clamp(dy / 120, 1) * GAZE_MAX;
      startLoop();
    };

    const scheduleWander = () => {
      wander = setTimeout(
        () => {
          if (Date.now() - lastPointer > 2500) {
            target.x = (Math.random() * 2 - 1) * GAZE_MAX * 0.75;
            target.y = (Math.random() * 2 - 1) * GAZE_MAX * 0.55;
            startLoop();
          }
          scheduleWander();
        },
        2600 + Math.random() * 2200,
      );
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    scheduleWander();
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      if (wander !== undefined) clearTimeout(wander);
      if (raf !== 0) cancelAnimationFrame(raf);
      gaze.style.removeProperty('--tess-look-x');
      gaze.style.removeProperty('--tess-look-y');
    };
  }, [reactive, reducedMotion]);

  const rootVars = {
    '--tess-breath-period': `${def.rhythm.breathPeriodMs}ms`,
    '--tess-breath-lo': String(breathLo(def.rhythm.breathIntensity)),
    '--tess-breath-hi': String(breathHi(def.rhythm.breathIntensity)),
    '--tess-drift-amp': `${-def.rhythm.driftAmp}px`,
  } as CSSProperties;

  const faceVars = {
    '--tess-eye-open': String(def.eyes.openness),
    '--tess-gaze-x': `${def.eyes.gazeX}px`,
    '--tess-gaze-y': `${def.eyes.gazeY}px`,
  } as CSSProperties;

  const svg = (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
      width={edge}
      height={edge}
      className={interactive ? 'tess' : className ? `tess ${className}` : 'tess'}
      style={rootVars}
      data-tess=""
      data-mood={def.name}
      data-reactive={reactive ? 'true' : undefined}
      data-react={reacting ? 'delight' : undefined}
      aria-hidden={interactive || !title ? true : undefined}
      role={!interactive && title ? 'img' : undefined}
      aria-label={!interactive && title ? title : undefined}
      focusable="false"
      onPointerDown={reactive && !interactive ? playDelight : undefined}
    >
      <g className="tess-figure">
        <g className="tess-breathe">
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
                        width={spec.w + 6}
                        height={spec.h + 6}
                        rx={spec.rx + 1.5}
                      />
                      <rect
                        className="tess-ember-hover"
                        x={spec.x - 3}
                        y={spec.y - 3}
                        width={spec.w + 6}
                        height={spec.h + 6}
                        rx={spec.rx + 1.5}
                      />
                    </>
                  ) : null}
                  <rect
                    className="tess-tile"
                    data-role={pose.role}
                    x={spec.x}
                    y={spec.y}
                    width={spec.w}
                    height={spec.h}
                    rx={spec.rx}
                  />
                  {slot === 'crown' ? (
                    <g className="tess-face" style={faceVars}>
                      <rect
                        className="tess-blush"
                        x={HEAD_CENTER.x - BLUSH.spread - BLUSH.w / 2}
                        y={HEAD_CENTER.y + EYE.lift + BLUSH.drop}
                        width={BLUSH.w}
                        height={BLUSH.h}
                        rx={BLUSH.rx}
                      />
                      <rect
                        className="tess-blush"
                        x={HEAD_CENTER.x + BLUSH.spread - BLUSH.w / 2}
                        y={HEAD_CENTER.y + EYE.lift + BLUSH.drop}
                        width={BLUSH.w}
                        height={BLUSH.h}
                        rx={BLUSH.rx}
                      />
                      <g ref={gazeRef} className="tess-gaze">
                        <rect
                          className="tess-eye"
                          x={HEAD_CENTER.x - EYE.spread - EYE.w / 2}
                          y={HEAD_CENTER.y + EYE.lift - EYE.h / 2}
                          width={EYE.w}
                          height={EYE.h}
                          rx={EYE.rx}
                        />
                        <rect
                          className="tess-eye"
                          x={HEAD_CENTER.x + EYE.spread - EYE.w / 2}
                          y={HEAD_CENTER.y + EYE.lift - EYE.h / 2}
                          width={EYE.w}
                          height={EYE.h}
                          rx={EYE.rx}
                        />
                      </g>
                    </g>
                  ) : null}
                </g>
              </g>
            );
          })}
        </g>

        {/* Mood props — ALWAYS rendered (SSR-identical DOM); CSS shows the active one
            per data-mood and choreographs its activity loop. Semantics live on the svg
            root (decorative aria-hidden / role=img), so the group needs no ARIA. */}
        <g className="tess-props">
          <g className="tess-prop tess-prop-kg">
            {PROPS.kg.edges.map(([a, b], i) => {
              const na = PROPS.kg.nodes[a]!;
              const nb = PROPS.kg.nodes[b]!;
              // A gentle quadratic bow perpendicular to the chord (smooth curves, v3.1).
              const mx = (na.x + nb.x) / 2;
              const my = (na.y + nb.y) / 2;
              const len = Math.hypot(nb.x - na.x, nb.y - na.y) || 1;
              const cx = mx + (-(nb.y - na.y) / len) * PROPS.kg.bow;
              const cy = my + ((nb.x - na.x) / len) * PROPS.kg.bow;
              return (
                <path
                  key={`e${i}`}
                  className="tess-kg-edge"
                  d={`M ${na.x} ${na.y} Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${nb.x} ${nb.y}`}
                />
              );
            })}
            {PROPS.kg.nodes.map((node, i) => (
              <circle
                key={`n${i}`}
                className="tess-kg-node"
                data-role={node.role}
                data-n={i}
                cx={node.x}
                cy={node.y}
                r={node.r}
              />
            ))}
          </g>
          <g className="tess-prop tess-prop-work">
            <rect
              className="tess-work-screen"
              x={PROPS.work.screen.x}
              y={PROPS.work.screen.y}
              width={PROPS.work.screen.w}
              height={PROPS.work.screen.h}
              rx={PROPS.work.screen.rx}
            />
            {PROPS.work.ticks.map((tick, i) => (
              <line
                key={`t${i}`}
                className="tess-work-tick"
                data-n={i}
                x1={tick.x1}
                y1={tick.y1}
                x2={tick.x2}
                y2={tick.y2}
              />
            ))}
            <rect
              className="tess-work-base"
              x={PROPS.work.base.x}
              y={PROPS.work.base.y}
              width={PROPS.work.base.w}
              height={PROPS.work.base.h}
              rx={PROPS.work.base.rx}
            />
          </g>
          <g className="tess-prop tess-prop-confetti">
            {PROPS.confetti.map((bit, i) => (
              <rect
                key={`c${i}`}
                className="tess-confetti"
                data-role={bit.role}
                data-n={i}
                x={bit.x - bit.s / 2}
                y={bit.y - bit.s / 2}
                width={bit.s}
                height={bit.s}
                rx={bit.s * 0.3}
              />
            ))}
          </g>
          <g className="tess-prop tess-prop-loose">
            <rect
              className="tess-loose-tile"
              x={PROPS.loose.x}
              y={PROPS.loose.y}
              width={PROPS.loose.w}
              height={PROPS.loose.h}
              rx={PROPS.loose.rx}
              transform={`rotate(${PROPS.loose.rotate} ${PROPS.loose.x + PROPS.loose.w / 2} ${
                PROPS.loose.y + PROPS.loose.h / 2
              })`}
            />
          </g>
        </g>
      </g>
    </svg>
  );

  if (!interactive) return svg;
  return (
    <button
      type="button"
      className={className ? `tess-button ${className}` : 'tess-button'}
      aria-label={title}
      onClick={() => {
        playDelight();
        onActivate?.();
      }}
    >
      {svg}
    </button>
  );
}
