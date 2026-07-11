/**
 * Tess's geometry — the single source of truth for the figure's layout (ADR-0046 v3).
 *
 * Six pieces (stakeholder-directed): a big head, the GILDED HEART AS THE BODY (Tess is
 * literally the arriving gilded tile), two floating hands — the limbs that perform each
 * mood's activity — and two feet. Per-mood PROPS (a mini knowledge graph, a work tile,
 * confetti, a loose tile) are part of the rig and always rendered (visibility is CSS per
 * data-mood), so the DOM shape stays identical for every mood (the SSR determinism
 * rule). Slots are NAMED and stable: moods pose slots, they never add or remove them.
 *
 *        [   crown   ]      (the head — eyes + blush live here)
 *  [handL] [ heart ] [handR] (the heart IS the body; hands float free)
 *        [ftL]  [ftR]
 */

/**
 * The square viewBox edge, in user units. The margins are the headroom the bob (±3.2),
 * the delight hop (−4), and hand gestures breathe into without clipping (enforced by
 * the geometry tests against THERMAL's life-motion constants).
 */
export const VIEWBOX = 104;

export const SLOTS = ['crown', 'heart', 'handL', 'handR', 'footL', 'footR'] as const;

export type SlotName = (typeof SLOTS)[number];

/**
 * Color roles resolve through the closed `--mascot-*` CSS contract:
 * tile → `--mascot-tile`, warm → `--mascot-tile-warm`, deep → `--mascot-tile-deep`,
 * heart → `--mascot-heart`. Unbound consumers degrade to `currentColor` (monochrome).
 * The eyes render on `--mascot-ink`, the blush on `--mascot-tile-warm`; props carry the
 * warm/deep accents.
 */
export type TileRole = 'tile' | 'warm' | 'deep' | 'heart';

export interface SlotSpec {
  /** Base x/y of the piece's top-left corner, user units. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly rx: number;
  /** Default color role (a mood may override per pose). */
  readonly role: TileRole;
  /** Default opacity. */
  readonly baseOpacity: number;
  /** Hands are limbs: they get the wider gesture-offset budget (THERMAL). */
  readonly limb: boolean;
}

/** The head: the creature's dominant mass (chibi proportions). */
export const HEAD = { x: 34, y: 14, w: 36, h: 30, rx: 9 } as const;

export const SLOT_SPECS: Record<SlotName, SlotSpec> = {
  crown: { ...HEAD, role: 'tile', baseOpacity: 0.97, limb: false },
  heart: { x: 37, y: 48, w: 30, h: 26, rx: 7, role: 'heart', baseOpacity: 1, limb: false },
  handL: { x: 20, y: 52, w: 13, h: 13, rx: 5, role: 'tile', baseOpacity: 0.92, limb: true },
  handR: { x: 71, y: 52, w: 13, h: 13, rx: 5, role: 'tile', baseOpacity: 0.92, limb: true },
  footL: { x: 39, y: 78, w: 13, h: 11, rx: 4.5, role: 'tile', baseOpacity: 0.85, limb: false },
  footR: { x: 56, y: 78, w: 13, h: 11, rx: 4.5, role: 'tile', baseOpacity: 0.85, limb: false },
};

/** The face: two ink eyes + a warm blush (ADR-0046 v2/v3). No gloves, no mouth. */
export const EYE = {
  w: 4.5,
  h: 8,
  rx: 2.2,
  /** Horizontal offset of each eye center from the head center. */
  spread: 6.5,
  /** Vertical offset of the eye row from the head center (slightly high = cute). */
  lift: -1.5,
} as const;

/** Blush pads under the eyes — the warm accent on the figure itself. */
export const BLUSH = { w: 5.5, h: 3, rx: 1.5, spread: 11.5, drop: 5 } as const;

/** Head center — the gaze origin. */
export const HEAD_CENTER = { x: HEAD.x + HEAD.w / 2, y: HEAD.y + HEAD.h / 2 } as const;

/** Maximum pointer-following gaze travel, user units (validated bound for mood bias). */
export const GAZE_MAX = 2.6;

/**
 * Prop geometry (ADR-0046 v3) — the task objects moods act on. Every prop is ALWAYS in
 * the DOM; `[data-mood]` CSS shows the relevant one and drives its activity loop.
 */
export const PROPS = {
  /** searching: a mini knowledge graph floating up-left; Tess scans its nodes. */
  kg: {
    nodes: [
      { x: 8, y: 26, r: 3.6, role: 'warm' as TileRole },
      { x: 20, y: 14, r: 3, role: 'tile' as TileRole },
      { x: 24, y: 32, r: 3.2, role: 'deep' as TileRole },
      { x: 33, y: 20, r: 2.6, role: 'tile' as TileRole },
    ],
    edges: [
      [0, 1],
      [1, 3],
      [0, 2],
      [2, 3],
    ] as ReadonlyArray<readonly [number, number]>,
  },
  /** working: the tile on the bench + output tick lines flickering beside Tess. */
  work: {
    tile: { x: 46, y: 80, w: 12, h: 10, rx: 3 },
    ticks: [
      { x1: 14, y1: 58, x2: 30, y2: 58 },
      { x1: 14, y1: 64, x2: 26, y2: 64 },
      { x1: 14, y1: 70, x2: 28, y2: 70 },
    ],
  },
  /** celebrating + delight: confetti tesserae bursting over the head. */
  confetti: [
    { x: 24, y: 18, s: 4, role: 'warm' as TileRole },
    { x: 40, y: 10, s: 3.4, role: 'deep' as TileRole },
    { x: 60, y: 9, s: 4, role: 'tile' as TileRole },
    { x: 76, y: 16, s: 3.4, role: 'warm' as TileRole },
    { x: 88, y: 30, s: 3, role: 'deep' as TileRole },
  ],
  /** alarmed: the loose tile that slipped out of the mosaic, shivering midair. */
  loose: { x: 82, y: 44, w: 11, h: 11, rx: 4, rotate: 14 },
} as const;
