/**
 * Tess's geometry — the single source of truth for the figure's layout (ADR-0046 v2).
 *
 * Tess is a cute, big-headed creature built from rounded tesserae (the logo's own
 * geometry language): a large head tile carrying the face (two ink eyes), a 3-wide
 * mosaic torso with the gilded heart at its chest, and two small feet. Slots are NAMED
 * and stable: moods pose slots, they never add or remove them, so the rendered DOM
 * shape is identical for every mood (the SSR determinism rule). The heart slot always
 * carries the gilded ember tile.
 *
 *      [   crown    ]   (the head — 26×22, eyes live here)
 *  [shL] [heart] [shR]
 *  [sdL] [core]  [sdR]
 *     [ftL]  [ftR]
 */

/**
 * The square viewBox edge, in user units. The figure is 88 tall / 62 wide, centered —
 * the surrounding margin is the headroom the bob (±3.2) and delight hop (−4) breathe
 * into without clipping (enforced by the geometry tests against THERMAL's life-motion
 * constants).
 */
export const VIEWBOX = 104;
/** Body tile edge length. */
export const TILE = 18;
/** Tile corner radius (proportional to the brand's rounded-square mark). */
export const TILE_RADIUS = 4.5;

export const SLOTS = [
  'crown',
  'shoulderL',
  'heart',
  'shoulderR',
  'sideL',
  'core',
  'sideR',
  'footL',
  'footR',
] as const;

export type SlotName = (typeof SLOTS)[number];

/**
 * Color roles resolve through the closed `--mascot-*` CSS contract:
 * tile → `--mascot-tile`, warm → `--mascot-tile-warm`, deep → `--mascot-tile-deep`,
 * heart → `--mascot-heart`. Unbound consumers degrade to `currentColor` (monochrome).
 * The eyes render on `--mascot-ink`.
 */
export type TileRole = 'tile' | 'warm' | 'deep' | 'heart';

export interface SlotSpec {
  /** Base x/y of the tile's top-left corner, user units. */
  readonly x: number;
  readonly y: number;
  /** Tile dimensions (the head is larger than the body tiles — cute proportions). */
  readonly w: number;
  readonly h: number;
  readonly rx: number;
  /** Default color role (a mood may override per pose). */
  readonly role: TileRole;
  /** Default opacity — the subtle mosaic grading of the resting figure. */
  readonly baseOpacity: number;
}

/* Columns: pitch 22 (18 tile + 4 gap), torso 62 wide centered → X0 = 21.
 * Rows: head 22 → torso 18 → torso 18 → feet 18, 4-unit seams → 88 tall, Y0 = 8. */
const X0 = 21;
const col = (c: number): number => X0 + c * (TILE + 4);
const ROW_HEAD = 8;
const ROW_1 = ROW_HEAD + 22 + 4; // 34
const ROW_2 = ROW_1 + TILE + 4; // 56
const ROW_FEET = ROW_2 + TILE + 4; // 78

/** The head: wide, tall, centered — the creature's dominant mass. */
export const HEAD = { x: 39, y: ROW_HEAD, w: 26, h: 22, rx: 6.5 } as const;

export const SLOT_SPECS: Record<SlotName, SlotSpec> = {
  crown: { ...HEAD, role: 'tile', baseOpacity: 0.97 },
  shoulderL: {
    x: col(0),
    y: ROW_1,
    w: TILE,
    h: TILE,
    rx: TILE_RADIUS,
    role: 'tile',
    baseOpacity: 0.9,
  },
  heart: { x: col(1), y: ROW_1, w: TILE, h: TILE, rx: TILE_RADIUS, role: 'heart', baseOpacity: 1 },
  shoulderR: {
    x: col(2),
    y: ROW_1,
    w: TILE,
    h: TILE,
    rx: TILE_RADIUS,
    role: 'tile',
    baseOpacity: 0.9,
  },
  sideL: {
    x: col(0),
    y: ROW_2,
    w: TILE,
    h: TILE,
    rx: TILE_RADIUS,
    role: 'warm',
    baseOpacity: 0.88,
  },
  core: { x: col(1), y: ROW_2, w: TILE, h: TILE, rx: TILE_RADIUS, role: 'tile', baseOpacity: 0.92 },
  sideR: {
    x: col(2),
    y: ROW_2,
    w: TILE,
    h: TILE,
    rx: TILE_RADIUS,
    role: 'deep',
    baseOpacity: 0.88,
  },
  footL: {
    x: col(0.5),
    y: ROW_FEET,
    w: TILE,
    h: TILE,
    rx: TILE_RADIUS,
    role: 'tile',
    baseOpacity: 0.85,
  },
  footR: {
    x: col(1.5),
    y: ROW_FEET,
    w: TILE,
    h: TILE,
    rx: TILE_RADIUS,
    role: 'tile',
    baseOpacity: 0.85,
  },
};

/**
 * The face (ADR-0046 v2): two ink eyes on the head tile — the minimal feature set that
 * makes a geometric figure read as alive. No gloves, no limbs, no mouth.
 */
export const EYE = {
  /** Eye pill dimensions — generous, chibi-cute, legible small. */
  w: 4,
  h: 7,
  rx: 2,
  /** Horizontal offset of each eye center from the head center. */
  spread: 5.6,
  /** Vertical offset of the eye row from the head center (slightly high = cute). */
  lift: -0.8,
} as const;

/** Head center — the gaze origin. */
export const HEAD_CENTER = { x: HEAD.x + HEAD.w / 2, y: HEAD.y + HEAD.h / 2 } as const;

/** Maximum pointer-following gaze travel, user units (validated bound for mood bias). */
export const GAZE_MAX = 2.4;
