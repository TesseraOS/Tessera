/**
 * Brand-master renderers (ADR-0046 v2) — pure string SVG built from the same geometry
 * and mood data as the live rig, so the checked-in brand assets can never drift from
 * the shipped figure (a package test compares them byte-for-byte).
 *
 * Masters carry the Desert Rose dusk values BY VALUE — the same sanctioned
 * "reproduce token values by hand" class as the OG/icon renderers (BRAND.md §2.1,
 * effect E-022): standalone brand files cannot consume CSS variables.
 */

import { EYE, HEAD_CENTER, SLOTS, SLOT_SPECS, VIEWBOX } from './geometry.js';
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
  ink: '#161013',
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

/** One figure's tiles + face at the given origin offset, as SVG markup. */
function renderFigure(mood: MoodDefinition, ox: number, oy: number): string {
  const parts: string[] = [];
  for (const slot of SLOTS) {
    const spec = SLOT_SPECS[slot];
    const pose = mood.poses[slot];
    const cx = ox + spec.x + spec.w / 2 + pose.dx;
    const cy = oy + spec.y + spec.h / 2 + pose.dy;
    const group = `translate(${fmt(cx)} ${fmt(cy)}) rotate(${fmt(pose.rotate)}) scale(${fmt(
      pose.scale,
    )})`;
    const tile = `<rect x="${fmt(-spec.w / 2)}" y="${fmt(-spec.h / 2)}" width="${fmt(
      spec.w,
    )}" height="${fmt(spec.h)}" rx="${fmt(spec.rx)}" fill="${FILL[pose.role]}" opacity="${fmt(
      pose.opacity,
    )}"/>`;
    if (slot === 'heart') {
      // The still ember glow — the calm frame the reduced-motion rig shows.
      const ember = `<rect x="${fmt(-spec.w / 2 - 3)}" y="${fmt(-spec.h / 2 - 3)}" width="${fmt(
        spec.w + 6,
      )}" height="${fmt(spec.h + 6)}" rx="${fmt(spec.rx + 1.5)}" fill="${
        DUSK.heart
      }" opacity="0.16"/>`;
      parts.push(`<g transform="${group}">${ember}${tile}</g>`);
    } else if (slot === 'crown') {
      // The face: two ink eyes at the mood's openness and gaze bias (ADR-0046 v2).
      const eyes = [-1, 1]
        .map((side) => {
          const ex = HEAD_CENTER.x - (SLOT_SPECS.crown.x + SLOT_SPECS.crown.w / 2);
          const eyeCx = ex + side * EYE.spread + mood.eyes.gazeX;
          const eyeCy =
            HEAD_CENTER.y -
            (SLOT_SPECS.crown.y + SLOT_SPECS.crown.h / 2) +
            EYE.lift +
            mood.eyes.gazeY;
          return `<g transform="translate(${fmt(eyeCx)} ${fmt(eyeCy)}) scale(1 ${fmt(
            mood.eyes.openness,
          )})"><rect x="${fmt(-EYE.w / 2)}" y="${fmt(-EYE.h / 2)}" width="${fmt(
            EYE.w,
          )}" height="${fmt(EYE.h)}" rx="${fmt(EYE.rx)}" fill="${DUSK.ink}"/></g>`;
        })
        .join('');
      parts.push(`<g transform="${group}">${tile}${eyes}</g>`);
    } else {
      parts.push(`<g transform="${group}">${tile}</g>`);
    }
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
