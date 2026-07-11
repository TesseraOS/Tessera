/**
 * Tess's geometry — the single source of truth for the figure's tile layout (ADR-0046).
 *
 * Tess is nine rounded-square tesserae (the logo's own geometry language) arranged as a
 * compact standing figure. Slots are NAMED and stable: moods pose slots, they never add
 * or remove them, so the rendered DOM shape is identical for every mood (the SSR
 * determinism rule). The heart slot always carries the gilded ember tile.
 *
 *        [crown]
 *  [shL] [heart] [shR]
 *  [sdL] [core]  [sdR]
 *     [ftL]  [ftR]
 */

/** The square viewBox edge, in user units. */
export const VIEWBOX = 96;
/** Tile edge length. */
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
 */
export type TileRole = 'tile' | 'warm' | 'deep' | 'heart';

export interface SlotSpec {
  /** Base x of the tile's top-left corner, user units. */
  readonly x: number;
  /** Base y of the tile's top-left corner, user units. */
  readonly y: number;
  /** Default color role (a mood may override per pose). */
  readonly role: TileRole;
  /** Default opacity — the subtle mosaic grading of the resting figure. */
  readonly baseOpacity: number;
}

/* Grid: pitch 22 (18 tile + 4 gap). Figure bounds 62×84, centered in the 96 box. */
const PITCH = TILE + 4;
const X0 = (VIEWBOX - (3 * TILE + 2 * 4)) / 2; // 17
const Y0 = (VIEWBOX - (4 * TILE + 3 * 4)) / 2; // 6
const col = (c: number): number => X0 + c * PITCH;
const row = (r: number): number => Y0 + r * PITCH;

export const SLOT_SPECS: Record<SlotName, SlotSpec> = {
  crown: { x: col(1), y: row(0), role: 'tile', baseOpacity: 0.95 },
  shoulderL: { x: col(0), y: row(1), role: 'tile', baseOpacity: 0.9 },
  heart: { x: col(1), y: row(1), role: 'heart', baseOpacity: 1 },
  shoulderR: { x: col(2), y: row(1), role: 'tile', baseOpacity: 0.9 },
  sideL: { x: col(0), y: row(2), role: 'warm', baseOpacity: 0.88 },
  core: { x: col(1), y: row(2), role: 'tile', baseOpacity: 0.92 },
  sideR: { x: col(2), y: row(2), role: 'deep', baseOpacity: 0.88 },
  footL: { x: col(0.5), y: row(3), role: 'tile', baseOpacity: 0.85 },
  footR: { x: col(1.5), y: row(3), role: 'tile', baseOpacity: 0.85 },
};
