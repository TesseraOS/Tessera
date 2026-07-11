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

/**
 * The head: the creature's dominant mass. Chibi ratio (v3.1, stakeholder-tuned): the
 * gilded body is ~58% of the head's width — much smaller than the head, clearly bigger
 * than the limbs (ratio-tested).
 */
export const HEAD = { x: 33, y: 18, w: 38, h: 32, rx: 10 } as const;

export const SLOT_SPECS: Record<SlotName, SlotSpec> = {
  crown: { ...HEAD, role: 'tile', baseOpacity: 0.97, limb: false },
  heart: { x: 41, y: 54, w: 22, h: 19, rx: 6, role: 'heart', baseOpacity: 1, limb: false },
  handL: { x: 25, y: 56, w: 12, h: 12, rx: 4.5, role: 'tile', baseOpacity: 0.92, limb: true },
  handR: { x: 67, y: 56, w: 12, h: 12, rx: 4.5, role: 'tile', baseOpacity: 0.92, limb: true },
  footL: { x: 38, y: 77, w: 12, h: 10, rx: 4, role: 'tile', baseOpacity: 0.85, limb: false },
  footR: { x: 54, y: 77, w: 12, h: 10, rx: 4, role: 'tile', baseOpacity: 0.85, limb: false },
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
  /**
   * searching: a knowledge graph floating up-left — six SMOOTH circle nodes with gently
   * curved edges (v3.1: bigger, rounder, more graph). Tess sweeps it node by node.
   */
  kg: {
    /** Kept fully LEFT of the head's posed edge (x ≤ 29 vs head ≥ 31) — the graph must
     * never tangle with the face. */
    nodes: [
      { x: 8, y: 29, r: 4.2, role: 'warm' as TileRole },
      { x: 15, y: 10, r: 3.4, role: 'tile' as TileRole },
      { x: 24, y: 41, r: 3.8, role: 'deep' as TileRole },
      { x: 26, y: 18, r: 3, role: 'tile' as TileRole },
      { x: 24, y: 30, r: 2.6, role: 'warm' as TileRole },
      { x: 15, y: 22, r: 3, role: 'tile' as TileRole },
    ],
    /** Hub-and-spoke around node 5, plus rim links. */
    edges: [
      [5, 0],
      [5, 1],
      [5, 3],
      [5, 4],
      [4, 2],
      [0, 2],
    ] as ReadonlyArray<readonly [number, number]>,
    /** Perpendicular bow of each curved edge, user units. */
    bow: 2.5,
  },
  /**
   * working: a real laptop at hand height (v3.1) — screen with flickering code ticks
   * over a base Tess's hands type on. Painted in front of the body.
   */
  work: {
    screen: { x: 42, y: 60, w: 20, h: 13, rx: 2.5 },
    base: { x: 40, y: 74.5, w: 24, h: 4, rx: 2 },
    ticks: [
      { x1: 45, y1: 63.5, x2: 58, y2: 63.5 },
      { x1: 45, y1: 66.5, x2: 54, y2: 66.5 },
      { x1: 45, y1: 69.5, x2: 56, y2: 69.5 },
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
  loose: { x: 80, y: 46, w: 11, h: 11, rx: 4, rotate: 14 },
} as const;
