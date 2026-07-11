/**
 * Brand-master renderers (ADR-0046) — pure string SVG built from the same geometry and
 * mood data as the live rig, so the checked-in brand assets can never drift from the
 * shipped figure (a package test compares them byte-for-byte).
 *
 * Masters carry the Desert Rose dusk values BY VALUE — the same sanctioned
 * "reproduce token values by hand" class as the OG/icon renderers (BRAND.md §2.1,
 * effect E-022): standalone brand files cannot consume CSS variables.
 */

import { SLOTS, SLOT_SPECS, TILE, TILE_RADIUS, VIEWBOX } from './geometry.js';
import type { TileRole } from './geometry.js';
import { CORE_MOODS, MOODS, SURFACE_MOODS } from './moods.js';
import type { MoodDefinition } from './moods.js';

/** BRAND.md §2.1 (dusk) — reproduced by value for standalone assets. */
const DUSK = {
  background: '#161013',
  tile: '#F4EDE7',
  warm: '#E2A3A8',
  deep: '#C8836C',
  heart: '#E4B65A',
  caption: '#B7A8A8',
} as const;

const FILL: Record<TileRole, string> = {
  tile: DUSK.tile,
  warm: DUSK.warm,
  deep: DUSK.deep,
  heart: DUSK.heart,
};

// XML comments must never contain a double hyphen — keep this note free of `--flags`.
const GENERATED_NOTE =
  '<!-- GENERATED from @tessera/mascot mood data by scripts/render-masters.mjs (ADR-0046). Do not hand-edit: regenerate via the package script `render-masters`. -->';

const fmt = (n: number): string => String(Number(n.toFixed(3)));

/** One figure's tiles at the given origin offset, as SVG markup. */
function renderFigure(mood: MoodDefinition, ox: number, oy: number): string {
  const parts: string[] = [];
  for (const slot of SLOTS) {
    const spec = SLOT_SPECS[slot];
    const pose = mood.poses[slot];
    const cx = ox + spec.x + TILE / 2 + pose.dx;
    const cy = oy + spec.y + TILE / 2 + pose.dy;
    const transform = `translate(${fmt(cx)} ${fmt(cy)}) rotate(${fmt(pose.rotate)}) scale(${fmt(
      pose.scale,
    )})`;
    if (slot === 'heart') {
      // The still ember glow — the calm frame the reduced-motion rig shows.
      parts.push(
        `<rect x="${fmt(-TILE / 2 - 3)}" y="${fmt(-TILE / 2 - 3)}" width="${fmt(
          TILE + 6,
        )}" height="${fmt(TILE + 6)}" rx="${fmt(TILE_RADIUS + 1.5)}" fill="${
          DUSK.heart
        }" opacity="0.16" transform="${transform}"/>`,
      );
    }
    parts.push(
      `<rect x="${fmt(-TILE / 2)}" y="${fmt(-TILE / 2)}" width="${fmt(TILE)}" height="${fmt(
        TILE,
      )}" rx="${fmt(TILE_RADIUS)}" fill="${FILL[pose.role]}" opacity="${fmt(
        pose.opacity,
      )}" transform="${transform}"/>`,
    );
  }
  return parts.join('\n    ');
}

/** The single master: Tess at rest (idle) on the dusk ground. */
export function renderMascotMasterSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" width="${VIEWBOX}" height="${VIEWBOX}" role="img" aria-label="Tess, the Tessera mascot, at rest">
  ${GENERATED_NOTE}
  <rect width="${VIEWBOX}" height="${VIEWBOX}" fill="${DUSK.background}"/>
  <g>
    ${renderFigure(MOODS.idle, 0, 0)}
  </g>
</svg>
`;
}

/** The mood sheet: every predefined mood, labeled, on the dusk ground. */
export function renderMoodSheetSvg(): string {
  const names = [...CORE_MOODS, ...SURFACE_MOODS];
  const cols = 5;
  const cellW = 120;
  const cellH = 138;
  const rows = Math.ceil(names.length / cols);
  const width = cols * cellW;
  const height = rows * cellH;
  const cells = names
    .map((name, i) => {
      const mood = MOODS[name];
      const ox = (i % cols) * cellW + (cellW - VIEWBOX) / 2;
      const oy = Math.floor(i / cols) * cellH + 10;
      const labelX = (i % cols) * cellW + cellW / 2;
      const labelY = oy + VIEWBOX + 18;
      return `<g>
    ${renderFigure(mood, ox, oy)}
    <text x="${fmt(labelX)}" y="${fmt(labelY)}" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="10" letter-spacing="0.08em" fill="${DUSK.caption}">${name}</text>
  </g>`;
    })
    .join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Tess mood sheet — every predefined mood">
  ${GENERATED_NOTE}
  <rect width="${width}" height="${height}" fill="${DUSK.background}"/>
  ${cells}
</svg>
`;
}
