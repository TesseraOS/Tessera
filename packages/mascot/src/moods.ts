/**
 * Tess's moods — data, not code (ADR-0046 v3).
 *
 * A mood is a validated record: one pose per slot (incl. the HANDS — the limbs that act
 * out each mood), a face (eye openness + gaze bias), and a rhythm. The activity itself
 * (typing on the work tile, scanning the mini knowledge graph, waving, cheering under
 * confetti) is choreographed in styles.css per `data-mood`, driving these posed pieces
 * and the always-rendered props. The pose IS the reduced-motion still frame, so every
 * mood has a designed still pose by construction. New moods go through
 * {@link defineMood}, which enforces slot coverage and the motion budgets.
 */

import { GAZE_MAX, SLOTS, SLOT_SPECS } from './geometry.js';
import type { SlotName, TileRole } from './geometry.js';

/**
 * Motion budgets (ADR-0046 v2/v3). The CHARACTER breathes at creature rate (3–6s) — the
 * brand's 9–14s ambient spec applies to field art, not to a pet. CSS mirrors these.
 */
export const THERMAL = {
  /** Mood-to-mood morph duration (ms) — reveals budget is ≤700. */
  moodMorphMs: 600,
  /** Micro-interaction duration (ms) — hover perk sits in 150–250. */
  microMs: 200,
  /** One-shot gestures (ms) — the delight hop + confetti burst; budget ≤1200. */
  oneShotMs: 1150,
  /** Breath/bob period bounds (ms) — creature rate, visibly alive. */
  breathMinMs: 3000,
  breathMaxMs: 6000,
  /** Pose limits for body pieces: offsets (user units), rotation (deg), scale. */
  maxOffset: 12,
  maxRotate: 20,
  minScale: 0.9,
  maxScale: 1.15,
  maxDrift: 6,
  /** Hands are limbs — they travel to chin/bench/graph/sky (ADR-0046 v3). */
  maxLimbOffset: 32,
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
  /** Rotation about the piece center, degrees. */
  readonly rotate: number;
  /** Scale about the piece center. */
  readonly scale: number;
  /** Absolute opacity (a near-zero value reads as the piece's empty socket). */
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
  /** Ambient piece drift amplitude, user units (0 = concentrated stillness). */
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
 * figure (unknown slot, missing heart) or the motion budgets (offsets — limbs get the
 * wider budget, rotation, scale, breath period, drift, eye openness, gaze).
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
    const offsetBudget = spec.limb ? THERMAL.maxLimbOffset : THERMAL.maxOffset;
    if (Math.abs(pose.dx) > offsetBudget || Math.abs(pose.dy) > offsetBudget) {
      fail(name, `slot "${slot}" offset exceeds ±${offsetBudget} user units`);
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
 * The predefined registry. Every mood is an ACTIVITY (ADR-0046 v3): the pose below is
 * its still frame, and styles.css choreographs the loop — hands act, props appear, the
 * face follows. Hand targets are computed from slot centers (handL 26.5/58.5,
 * handR 77.5/58.5).
 */
export const MOODS: Readonly<Record<MoodName, MoodDefinition>> = Object.freeze({
  idle: defineMood({
    name: 'idle',
    description: 'Tess rests — breathing softly, blinking, glancing about.',
    poses: {
      crown: { rotate: 1.5 },
      footL: { dx: -1 },
      footR: { dx: 1 },
    },
    rhythm: { breathPeriodMs: 4200, breathIntensity: 0.5, driftAmp: 1.5 },
  }),

  curious: defineMood({
    name: 'curious',
    description: 'Tess leans in, a hand at its chin, eyes wide on something interesting.',
    poses: {
      crown: { dx: 2, dy: -1, rotate: 6 },
      heart: { dx: 0.5 },
      handL: { dx: -1, dy: 1 },
      handR: { dx: -4.5, dy: -10.5, rotate: -10 },
      footR: { dx: 1, rotate: 2 },
    },
    eyes: { openness: 1.15, gazeX: 1.6, gazeY: -0.8 },
    rhythm: { breathPeriodMs: 3600, breathIntensity: 0.65, driftAmp: 1.5 },
  }),

  working: defineMood({
    name: 'working',
    description: 'Tess types away at a tile on its bench, eyes down on the work.',
    poses: {
      crown: { dy: 1.5, rotate: -1 },
      heart: { dy: 0.5 },
      handL: { dx: 13, dy: 10, rotate: 8 },
      handR: { dx: -13, dy: 10, rotate: -8 },
      footL: { dx: 1 },
      footR: { dx: -1 },
    },
    eyes: { openness: 0.8, gazeX: 0.3, gazeY: 1.2 },
    rhythm: { breathPeriodMs: 3200, breathIntensity: 0.85, driftAmp: 1 },
  }),

  satisfied: defineMood({
    name: 'satisfied',
    description: 'Hands on hips, work done — Tess squints with quiet contentment.',
    poses: {
      handL: { dx: 6, dy: 8, rotate: -18 },
      handR: { dx: -6, dy: 8, rotate: 18 },
    },
    eyes: { openness: 0.55, gazeY: 0.3 },
    rhythm: { breathPeriodMs: 5200, breathIntensity: 0.45, driftAmp: 1 },
  }),

  alarmed: defineMood({
    name: 'alarmed',
    description: 'A tile has slipped loose — Tess throws its hands up, wide-eyed.',
    poses: {
      crown: { dx: -1, rotate: -6 },
      heart: { dx: -1, scale: 1.03 },
      handL: { dx: -4, dy: -24, rotate: -14 },
      handR: { dx: 4, dy: -24, rotate: 14 },
      footL: { dx: -3 },
      footR: { dx: 3, rotate: -2 },
    },
    eyes: { openness: 1.35, gazeX: 1.8, gazeY: 0.4 },
    rhythm: { breathPeriodMs: 3000, breathIntensity: 1, driftAmp: 1 },
  }),

  celebrating: defineMood({
    name: 'celebrating',
    description: 'Confetti tesserae rain down — Tess cheers with both hands high.',
    poses: {
      crown: { dy: -1, rotate: 3 },
      heart: { dy: -1, scale: 1.06 },
      handL: { dx: -1, dy: -30, rotate: -12 },
      handR: { dx: 1, dy: -30, rotate: 12 },
      footL: { dx: 1 },
      footR: { dx: -1 },
    },
    eyes: { openness: 0.6, gazeY: -1 },
    rhythm: { breathPeriodMs: 3400, breathIntensity: 1, driftAmp: 1.5 },
  }),

  greeting: defineMood({
    name: 'greeting',
    description: 'Tess waves a hand in welcome, eyes bright.',
    poses: {
      crown: { dy: 0.5, rotate: 8 },
      heart: { dy: 0.5 },
      handR: { dx: 3, dy: -22, rotate: 14 },
      footL: { dx: -0.5 },
      footR: { dx: 0.5 },
    },
    eyes: { openness: 1.1 },
    rhythm: { breathPeriodMs: 3800, breathIntensity: 0.7, driftAmp: 1.5 },
  }),

  lost: defineMood({
    name: 'lost',
    description: 'A foot tile is missing — Tess scratches its head, scanning for the piece.',
    poses: {
      crown: { dx: -2, rotate: -9 },
      heart: { dx: -1 },
      handL: { dx: -1, dy: 1 },
      handR: { dx: -3, dy: -32, rotate: -12 },
      footL: { dx: -2 },
      footR: { dy: 1, opacity: 0.15 },
    },
    eyes: { openness: 1.1, gazeX: -1.8, gazeY: 0.6 },
    rhythm: { breathPeriodMs: 3600, breathIntensity: 0.8, driftAmp: 1.5 },
  }),

  searching: defineMood({
    name: 'searching',
    description: 'A little knowledge graph hangs in the air — Tess sweeps it node by node.',
    poses: {
      crown: { dx: -2, dy: -0.5, rotate: -8 },
      heart: { dx: -0.5 },
      handL: { dx: -3, dy: -10, rotate: -8 },
      handR: { dx: -1, dy: 1 },
      footR: { dx: 0.5 },
    },
    eyes: { openness: 1.15, gazeX: -1.6, gazeY: -1.2 },
    rhythm: { breathPeriodMs: 3400, breathIntensity: 0.7, driftAmp: 1.5 },
  }),

  watching: defineMood({
    name: 'watching',
    description: 'Perched and compact, Tess keeps a slow, blinking lookout.',
    poses: {
      crown: { dy: 2, rotate: -2 },
      heart: { dy: 1, scale: 0.98 },
      handL: { dx: 4, dy: 2 },
      handR: { dx: -4, dy: 2 },
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
