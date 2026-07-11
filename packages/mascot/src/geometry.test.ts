import { describe, expect, it } from 'vitest';
import { SLOTS, SLOT_SPECS, TILE, VIEWBOX } from './geometry.js';
import { CORE_MOODS, MOODS, SURFACE_MOODS } from './moods.js';

describe("Tess's geometry", () => {
  it('is nine named tiles', () => {
    expect(SLOTS).toHaveLength(9);
    expect(new Set(SLOTS).size).toBe(9);
  });

  it('keeps every posed tile inside the viewBox for every mood, drift included', () => {
    for (const name of [...CORE_MOODS, ...SURFACE_MOODS]) {
      const mood = MOODS[name];
      for (const slot of SLOTS) {
        const spec = SLOT_SPECS[slot];
        const pose = mood.poses[slot];
        // Exact axis-aligned half-extent of a rotated, scaled square, so the figure can
        // never clip against the (overflow: hidden) viewBox — the ambient drift lifts a
        // tile by up to driftAmp on top of its pose.
        const rad = (Math.abs(pose.rotate) * Math.PI) / 180;
        const half = (TILE / 2) * pose.scale * (Math.abs(Math.cos(rad)) + Math.abs(Math.sin(rad)));
        const grow = half - TILE / 2;
        const drift = mood.rhythm.driftAmp;
        expect(spec.x + pose.dx - grow, `${name}.${slot} left`).toBeGreaterThanOrEqual(0);
        expect(spec.y + pose.dy - grow - drift, `${name}.${slot} top`).toBeGreaterThanOrEqual(0);
        expect(spec.x + TILE + pose.dx + grow, `${name}.${slot} right`).toBeLessThanOrEqual(
          VIEWBOX,
        );
        expect(spec.y + TILE + pose.dy + grow, `${name}.${slot} bottom`).toBeLessThanOrEqual(
          VIEWBOX,
        );
      }
    }
  });

  it('never overlaps base tiles (the mosaic keeps its seams)', () => {
    const specs = SLOTS.map((slot) => SLOT_SPECS[slot]);
    for (let a = 0; a < specs.length; a += 1) {
      for (let b = a + 1; b < specs.length; b += 1) {
        const sa = specs[a]!;
        const sb = specs[b]!;
        const apart = Math.abs(sa.x - sb.x) >= TILE + 2 || Math.abs(sa.y - sb.y) >= TILE + 2;
        expect(apart, `${SLOTS[a]} vs ${SLOTS[b]}`).toBe(true);
      }
    }
  });

  it('stays legible at the minimum rendered size (tile ≥ 4.5 CSS px at 24px)', () => {
    const minTilePx = (TILE / VIEWBOX) * 24;
    expect(minTilePx).toBeGreaterThanOrEqual(4.5);
  });
});
