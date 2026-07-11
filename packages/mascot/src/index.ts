/**
 * @tessera/mascot — Tess, the Tessera brand mascot (ADR-0046).
 *
 * A tessera-built figure with data-driven moods, CSS-only thermal motion, and a closed
 * `--mascot-*` theming contract. Import the stylesheet once per app:
 * `import '@tessera/mascot/styles.css'`.
 */

export {
  EYE,
  GAZE_MAX,
  HEAD,
  HEAD_CENTER,
  SLOTS,
  SLOT_SPECS,
  TILE,
  TILE_RADIUS,
  VIEWBOX,
} from './geometry.js';
export type { SlotName, SlotSpec, TileRole } from './geometry.js';

export { CORE_MOODS, MOODS, SURFACE_MOODS, THERMAL, defineMood, isMoodName } from './moods.js';
export type {
  MoodDefinition,
  MoodEyes,
  MoodInput,
  MoodName,
  MoodRhythm,
  TilePose,
} from './moods.js';

export { DEFAULT_SIZE, MIN_SIZE, Mascot } from './mascot.js';
export type { MascotProps } from './mascot.js';

export { renderMascotMasterSvg, renderMoodSheetSvg } from './masters.js';
