/**
 * Tess's moods — data, not code (ADR-0046 v2).
 *
 * A mood is a validated record: one pose per slot, a face (eye openness + gaze bias),
 * and a rhythm. The pose IS the reduced-motion still frame (breath, blink, gaze and
 * gestures are overlays that simply stop), so every mood has a designed still pose by
 * construction. New moods — including surface-specific ones in consuming apps — go
 * through {@link defineMood}, which enforces slot coverage and the motion budgets; the
 * figure is never redrawn.
 */

import { GAZE_MAX, SLOTS, SLOT_SPECS } from './geometry.js';
import type { SlotName, TileRole } from './geometry.js';

/**
 * Motion budgets (ADR-0046 v2). The CHARACTER breathes at creature rate (3–6s) — the
 * brand's 9–14s ambient spec applies to field art (mosaic fields, shaders), not to a
 * pet. CSS mirrors these values.
 */
export const THERMAL = {
  /** Mood-to-mood morph duration (ms) — reveals budget is ≤700. */
  moodMorphMs: 600,
  /** Micro-interaction duration (ms) — hover perk sits in 150–250. */
  microMs: 200,
  /** One-shot gestures (ms) — the delight hop / re-seat / sheen; budget ≤1200. */
  oneShotMs: 1150,
  /** Breath/bob period bounds (ms) — creature rate, visibly alive. */
  breathMinMs: 3000,
  breathMaxMs: 6000,
  /** Pose limits: offsets (user units), rotation (deg), scale, ambient drift (units). */
  maxOffset: 12,
  maxRotate: 20,
  minScale: 0.9,
  maxScale: 1.15,
  maxDrift: 6,
  /** Face limits: eye openness scale and gaze bias travel (user units). */
  minOpenness: 0.25,
  maxOpenness: 1.4,
  maxGaze: GAZE_MAX,
  /**
   * Life-motion displacements, user units — styles.css MIRRORS these values (the bob's
   * translate/scale and the delight hop's apex). The geometry tests use them to prove
   * no mood can clip the viewBox even mid-bob or mid-hop.
   */
  bobTranslate: 1.4,
  bobScale: 1.02,
  hopTranslate: 4,
} as const;

export interface TilePose {
  /** Offset from the slot's base position, user units. */
  readonly dx: number;
  readonly dy: number;
  /** Rotation about the tile center, degrees. */
  readonly rotate: number;
  /** Scale about the tile center. */
  readonly scale: number;
  /** Absolute opacity (a near-zero value reads as the tile's empty socket). */
  readonly opacity: number;
  /** Color role for this mood. */
  readonly role: TileRole;
}

export type TilePoseInput = Partial<TilePose>;

/** The face: what the eyes are doing in this mood (ADR-0046 v2). */
export interface MoodEyes {
  /** Vertical eye openness: 1 = neutral, >1 wide (alarm), <1 squint (joy/content). */
  readonly openness: number;
  /** Resting gaze bias from center, user units (pointer-following adds on top). */
  readonly gazeX: number;
  readonly gazeY: number;
}

export interface MoodRhythm {
  /** Breath/bob + heart-glow period, ms (creature rate; stops under reduced motion). */
  readonly breathPeriodMs: number;
  /** Breath amplitude 0–1 (maps to the ember glow's opacity swing). */
  readonly breathIntensity: number;
  /** Ambient per-tile drift amplitude, user units (0 = concentrated stillness). */
  readonly driftAmp: number;
}

export interface MoodDefinition {
  /** Kebab-case identifier; becomes the rendered `data-mood`. */
  readonly name: string;
  /** Human text alternative — what this mood conveys (used for sr text by consumers). */
  readonly description: string;
  /** One pose per slot — complete by construction. */
  readonly poses: Readonly<Record<SlotName, TilePose>>;
  readonly eyes: MoodEyes;
  readonly rhythm: MoodRhythm;
}

export interface MoodInput {
  name: string;
  description: string;
  /** Sparse poses; unlisted slots (and fields) take the seated defaults. */
  poses?: Partial<Record<SlotName, TilePoseInput>>;
  /** Sparse face; defaults to neutral open eyes looking ahead. */
  eyes?: Partial<MoodEyes>;
  rhythm: MoodRhythm;
}

const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

function fail(name: string, message: string): never {
  throw new Error(`@tessera/mascot: mood "${name}" is invalid — ${message}`);
}

/**
 * Build a validated mood. Throws with a precise message when the data would break the
 * figure (unknown slot, missing heart) or the motion budgets (offsets, rotation, scale,
 * breath period, drift, eye openness, gaze). Apps use this for custom surface moods.
 */
export function defineMood(input: MoodInput): MoodDefinition {
  const { name, description, rhythm } = input;
  if (!NAME_PATTERN.test(name)) {
    fail(String(name), 'names are kebab-case: /^[a-z][a-z0-9-]*$/');
  }
  if (typeof description !== 'string' || description.trim().length === 0) {
    fail(name, 'a description (text alternative) is required');
  }
  for (const slot of Object.keys(input.poses ?? {})) {
    if (!SLOTS.includes(slot as SlotName)) {
      fail(name, `unknown slot "${slot}" — slots are fixed: ${SLOTS.join(', ')}`);
    }
  }

  const poses = {} as Record<SlotName, TilePose>;
  for (const slot of SLOTS) {
    const spec = SLOT_SPECS[slot];
    const p = input.poses?.[slot] ?? {};
    const pose: TilePose = {
      dx: p.dx ?? 0,
      dy: p.dy ?? 0,
      rotate: p.rotate ?? 0,
      scale: p.scale ?? 1,
      opacity: p.opacity ?? spec.baseOpacity,
      role: p.role ?? spec.role,
    };
    if (Math.abs(pose.dx) > THERMAL.maxOffset || Math.abs(pose.dy) > THERMAL.maxOffset) {
      fail(name, `slot "${slot}" offset exceeds ±${THERMAL.maxOffset} user units`);
    }
    if (Math.abs(pose.rotate) > THERMAL.maxRotate) {
      fail(name, `slot "${slot}" rotation exceeds ±${THERMAL.maxRotate}°`);
    }
    if (pose.scale < THERMAL.minScale || pose.scale > THERMAL.maxScale) {
      fail(name, `slot "${slot}" scale is outside ${THERMAL.minScale}–${THERMAL.maxScale}`);
    }
    if (pose.opacity < 0 || pose.opacity > 1) {
      fail(name, `slot "${slot}" opacity is outside 0–1`);
    }
    poses[slot] = pose;
  }
  if (poses.heart.opacity < 0.9) {
    fail(name, 'the gilded heart is always present (heart opacity must be ≥0.9)');
  }

  const eyes: MoodEyes = {
    openness: input.eyes?.openness ?? 1,
    gazeX: input.eyes?.gazeX ?? 0,
    gazeY: input.eyes?.gazeY ?? 0,
  };
  if (eyes.openness < THERMAL.minOpenness || eyes.openness > THERMAL.maxOpenness) {
    fail(name, `eye openness is outside ${THERMAL.minOpenness}–${THERMAL.maxOpenness}`);
  }
  if (Math.abs(eyes.gazeX) > THERMAL.maxGaze || Math.abs(eyes.gazeY) > THERMAL.maxGaze) {
    fail(name, `gaze bias exceeds ±${THERMAL.maxGaze} user units`);
  }

  if (rhythm.breathPeriodMs < THERMAL.breathMinMs || rhythm.breathPeriodMs > THERMAL.breathMaxMs) {
    fail(name, `breath period must sit in ${THERMAL.breathMinMs}–${THERMAL.breathMaxMs}ms`);
  }
  if (rhythm.breathIntensity < 0 || rhythm.breathIntensity > 1) {
    fail(name, 'breath intensity is 0–1');
  }
  if (rhythm.driftAmp < 0 || rhythm.driftAmp > THERMAL.maxDrift) {
    fail(name, `drift amplitude must sit in 0–${THERMAL.maxDrift} user units`);
  }

  return Object.freeze({
    name,
    description,
    poses: Object.freeze(poses),
    eyes: Object.freeze(eyes),
    rhythm: Object.freeze({ ...rhythm }),
  });
}

/** The general moods, locked by ADR-0046. */
export const CORE_MOODS = [
  'idle',
  'curious',
  'working',
  'satisfied',
  'alarmed',
  'celebrating',
] as const;

/** The placement-specific moods shipped with the rig. */
export const SURFACE_MOODS = ['greeting', 'lost', 'searching', 'watching'] as const;

export type MoodName = (typeof CORE_MOODS)[number] | (typeof SURFACE_MOODS)[number];

/**
 * The predefined registry. Expression channels (BRAND.md §5): the eyes (openness,
 * gaze), posture (arrangement), alignment (a misplaced tile is distress; a seated grid
 * is satisfaction), rhythm (breath/bob at creature rate), light (the ember; the
 * celebrating sheen plays in CSS on mood entry). Per-mood gestures live in styles.css.
 */
export const MOODS: Readonly<Record<MoodName, MoodDefinition>> = Object.freeze({
  idle: defineMood({
    name: 'idle',
    description: 'Tess rests — breathing softly, eyes wandering now and then.',
    poses: {
      crown: { rotate: 1.5 },
      footL: { dx: -1 },
      footR: { dx: 1 },
    },
    eyes: { openness: 1 },
    rhythm: { breathPeriodMs: 4200, breathIntensity: 0.5, driftAmp: 1.5 },
  }),

  curious: defineMood({
    name: 'curious',
    description: 'Tess leans in, head tilted, eyes wide on something interesting.',
    poses: {
      crown: { dx: 2, dy: -1, rotate: 6 },
      shoulderL: { rotate: -2 },
      shoulderR: { dx: 1, dy: -1, rotate: 3 },
      heart: { dx: 0.5, dy: -0.5 },
      sideL: { rotate: -1 },
      sideR: { dx: 0.5 },
      core: { dx: 0.5 },
      footR: { dx: 1, dy: -0.5, rotate: 2 },
    },
    eyes: { openness: 1.15, gazeX: 1.6, gazeY: -0.8 },
    rhythm: { breathPeriodMs: 3600, breathIntensity: 0.65, driftAmp: 1.5 },
  }),

  working: defineMood({
    name: 'working',
    description: 'Tess gathers its tiles tight, eyes down on the work, heart beating fast.',
    poses: {
      crown: { dy: 1.5, rotate: -1 },
      shoulderL: { dx: 1.5, dy: 0.5 },
      shoulderR: { dx: -1.5, dy: 0.5 },
      heart: { scale: 0.96 },
      sideL: { dx: 2 },
      sideR: { dx: -2 },
      core: { dy: 0.5 },
      footL: { dx: 1 },
      footR: { dx: -1 },
    },
    eyes: { openness: 0.8, gazeX: 0.5, gazeY: 1.1 },
    rhythm: { breathPeriodMs: 3200, breathIntensity: 0.85, driftAmp: 1 },
  }),

  satisfied: defineMood({
    name: 'satisfied',
    description: 'Every tile seated perfectly — Tess squints with quiet contentment.',
    poses: {
      crown: { opacity: 0.99 },
      shoulderL: { opacity: 0.95 },
      shoulderR: { opacity: 0.95 },
      sideL: { opacity: 0.94 },
      core: { opacity: 0.97 },
      sideR: { opacity: 0.94 },
      footL: { opacity: 0.92 },
      footR: { opacity: 0.92 },
    },
    eyes: { openness: 0.55, gazeY: 0.3 },
    rhythm: { breathPeriodMs: 5200, breathIntensity: 0.45, driftAmp: 1 },
  }),

  alarmed: defineMood({
    name: 'alarmed',
    description: 'A tile has slipped out of place — Tess stares wide-eyed and braces.',
    poses: {
      crown: { dx: -1, rotate: -6 },
      shoulderL: { dx: -2, rotate: -2 },
      shoulderR: { dx: -1.5, rotate: -3 },
      heart: { scale: 1.04 },
      sideL: { dx: -2.5 },
      core: { dx: -1 },
      sideR: { dx: 7, dy: -5, rotate: 16, opacity: 0.95 },
      footL: { dx: -3 },
      footR: { dx: 3, rotate: -2 },
    },
    eyes: { openness: 1.35, gazeX: 1.8, gazeY: 0.4 },
    rhythm: { breathPeriodMs: 3000, breathIntensity: 1, driftAmp: 1 },
  }),

  celebrating: defineMood({
    name: 'celebrating',
    description: 'The gilded heart lifts and re-seats — Tess gazes up at it, delighted.',
    poses: {
      crown: { dy: -1, rotate: 3 },
      shoulderL: { dx: -3, dy: -1, rotate: -6, role: 'warm' },
      shoulderR: { dx: 3, dy: -1, rotate: 6, role: 'warm' },
      heart: { dy: -3, scale: 1.1 },
      sideL: { dx: -1.5 },
      sideR: { dx: 1.5 },
      core: { dy: 0.5 },
      footL: { dx: 1 },
      footR: { dx: -1 },
    },
    eyes: { openness: 0.6, gazeY: 1.2 },
    rhythm: { breathPeriodMs: 3400, breathIntensity: 1, driftAmp: 1.5 },
  }),

  greeting: defineMood({
    name: 'greeting',
    description: 'Tess bows slightly and lifts a shoulder tile in welcome, eyes bright.',
    poses: {
      crown: { dy: 1, rotate: 8 },
      shoulderL: { dy: 0.5 },
      shoulderR: { dy: -3.5, rotate: 8 },
      heart: { dy: 0.5 },
      footL: { dx: -0.5 },
      footR: { dx: 0.5 },
    },
    eyes: { openness: 1.1 },
    rhythm: { breathPeriodMs: 3800, breathIntensity: 0.7, driftAmp: 1.5 },
  }),

  lost: defineMood({
    name: 'lost',
    description: 'One tile is missing — Tess scans left and right for the piece.',
    poses: {
      crown: { dx: -2, rotate: -9 },
      shoulderL: { dx: -1, rotate: -3 },
      shoulderR: { dx: -0.5, rotate: -2 },
      heart: { dx: -0.5, scale: 1.02 },
      sideL: { dx: -1.5, rotate: -2 },
      core: { dx: -1 },
      sideR: { dx: -1, rotate: 2 },
      footL: { dx: -2 },
      footR: { dy: 1, opacity: 0.15 },
    },
    eyes: { openness: 1.1, gazeX: -1.8, gazeY: 0.6 },
    rhythm: { breathPeriodMs: 3600, breathIntensity: 0.8, driftAmp: 1.5 },
  }),

  searching: defineMood({
    name: 'searching',
    description: 'Tess looks up and away, eyes sweeping for something not yet found.',
    poses: {
      crown: { dx: -2, dy: -0.5, rotate: -8 },
      shoulderL: { dx: -1.5, dy: -0.5, rotate: -4 },
      shoulderR: { dx: -1, rotate: -3 },
      heart: { dx: -0.5 },
      sideL: { dx: -1 },
      sideR: { dx: -0.5, rotate: -1 },
      footR: { dx: 0.5 },
    },
    eyes: { openness: 1.15, gazeX: -1.6, gazeY: -1.2 },
    rhythm: { breathPeriodMs: 3400, breathIntensity: 0.7, driftAmp: 1.5 },
  }),

  watching: defineMood({
    name: 'watching',
    description: 'Perched and compact, Tess keeps a calm, blinking watch.',
    poses: {
      crown: { dy: 2, rotate: -2 },
      shoulderL: { dx: 1, dy: 1.5 },
      shoulderR: { dx: -1, dy: 1.5 },
      heart: { dy: 1, scale: 0.97 },
      sideL: { dx: 2, dy: 1 },
      core: { dy: 1 },
      sideR: { dx: -2, dy: 1 },
      footL: { dx: 1.5, dy: -1 },
      footR: { dx: -1.5, dy: -1 },
    },
    eyes: { openness: 0.9, gazeX: 1.2, gazeY: 0.2 },
    rhythm: { breathPeriodMs: 4000, breathIntensity: 0.6, driftAmp: 1 },
  }),
});

/** True when `value` names a predefined mood. */
export function isMoodName(value: string): value is MoodName {
  return Object.hasOwn(MOODS, value);
}
