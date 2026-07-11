import { describe, expect, it } from 'vitest';
import { EYE, HEAD, PROPS, SLOTS, SLOT_SPECS, VIEWBOX } from './geometry.js';
import { CORE_MOODS, MOODS, SURFACE_MOODS, THERMAL } from './moods.js';

describe("Tess's geometry (ADR-0046 v3)", () => {
  it('is six named pieces — head, gilded heart-body, two hands, two feet', () => {
    expect(SLOTS).toEqual(['crown', 'heart', 'handL', 'handR', 'footL', 'footR']);
    expect(SLOT_SPECS.crown.w).toBeGreaterThan(SLOT_SPECS.heart.w);
    expect(SLOT_SPECS.heart.role).toBe('heart');
    expect(SLOT_SPECS.handL.limb).toBe(true);
    expect(SLOT_SPECS.handR.limb).toBe(true);
  });

  it('keeps every posed piece inside the viewBox — even mid-bob, mid-hop, and mid-drift', () => {
    const bottom = Math.max(...SLOTS.map((s) => SLOT_SPECS[s].y + SLOT_SPECS[s].h));
    const top = Math.min(...SLOTS.map((s) => SLOT_SPECS[s].y));
    const figureHeight = bottom - top;
    const bobLift = THERMAL.bobTranslate + (THERMAL.bobScale - 1) * figureHeight;
    const bodyLift = Math.max(bobLift, THERMAL.hopTranslate);

    for (const name of [...CORE_MOODS, ...SURFACE_MOODS]) {
      const mood = MOODS[name];
      for (const slot of SLOTS) {
        const spec = SLOT_SPECS[slot];
        const pose = mood.poses[slot];
        const rad = (Math.abs(pose.rotate) * Math.PI) / 180;
        const extX =
          ((spec.w / 2) * Math.abs(Math.cos(rad)) + (spec.h / 2) * Math.abs(Math.sin(rad))) *
          pose.scale;
        const extY =
          ((spec.w / 2) * Math.abs(Math.sin(rad)) + (spec.h / 2) * Math.abs(Math.cos(rad))) *
          pose.scale;
        const growX = extX - spec.w / 2;
        const growY = extY - spec.h / 2;
        const drift = mood.rhythm.driftAmp;

        expect(spec.x + pose.dx - growX, `${name}.${slot} left`).toBeGreaterThanOrEqual(0);
        expect(spec.x + spec.w + pose.dx + growX, `${name}.${slot} right`).toBeLessThanOrEqual(
          VIEWBOX,
        );
        expect(
          spec.y + pose.dy - growY - drift - bodyLift,
          `${name}.${slot} top (with life motion)`,
        ).toBeGreaterThanOrEqual(0);
        expect(spec.y + spec.h + pose.dy + growY, `${name}.${slot} bottom`).toBeLessThanOrEqual(
          VIEWBOX,
        );
      }
    }
  });

  it('never overlaps base pieces (the mosaic keeps its seams)', () => {
    for (let a = 0; a < SLOTS.length; a += 1) {
      for (let b = a + 1; b < SLOTS.length; b += 1) {
        const sa = SLOT_SPECS[SLOTS[a]!];
        const sb = SLOT_SPECS[SLOTS[b]!];
        const apart =
          sa.x + sa.w + 2 <= sb.x ||
          sb.x + sb.w + 2 <= sa.x ||
          sa.y + sa.h + 2 <= sb.y ||
          sb.y + sb.h + 2 <= sa.y;
        expect(apart, `${SLOTS[a]} vs ${SLOTS[b]}`).toBe(true);
      }
    }
  });

  it('keeps every prop inside the viewBox with its animation amplitude', () => {
    // Confetti falls up to 22 units and floats 5 up; KG pulses scale 1.3; margins of 2.
    for (const node of PROPS.kg.nodes) {
      expect(node.x - node.r * 1.3).toBeGreaterThanOrEqual(2);
      expect(node.y - node.r * 1.3).toBeGreaterThanOrEqual(2);
    }
    for (const bit of PROPS.confetti) {
      expect(bit.y - bit.s / 2 - 5, 'confetti top').toBeGreaterThanOrEqual(2);
      expect(bit.y + bit.s / 2 + 22, 'confetti fall').toBeLessThanOrEqual(VIEWBOX - 2);
      expect(bit.x + bit.s / 2).toBeLessThanOrEqual(VIEWBOX - 2);
    }
    const work = PROPS.work.tile;
    expect(work.y + work.h + 2).toBeLessThanOrEqual(VIEWBOX);
    const loose = PROPS.loose;
    expect(loose.x + loose.w + 4, 'loose tile right (rotated + shiver)').toBeLessThanOrEqual(
      VIEWBOX,
    );
  });

  it('keeps both eyes inside the head at every mood gaze and openness', () => {
    const headCx = HEAD.x + HEAD.w / 2;
    const headCy = HEAD.y + HEAD.h / 2;
    for (const name of [...CORE_MOODS, ...SURFACE_MOODS]) {
      const { eyes } = MOODS[name];
      for (const side of [-1, 1]) {
        const cx = headCx + side * EYE.spread + eyes.gazeX;
        const cy = headCy + EYE.lift + eyes.gazeY;
        const halfH = (EYE.h / 2) * Math.min(eyes.openness, THERMAL.maxOpenness);
        expect(cx - EYE.w / 2, `${name} eye left`).toBeGreaterThanOrEqual(HEAD.x + 1);
        expect(cx + EYE.w / 2, `${name} eye right`).toBeLessThanOrEqual(HEAD.x + HEAD.w - 1);
        expect(cy - halfH, `${name} eye top`).toBeGreaterThanOrEqual(HEAD.y + 1);
        expect(cy + halfH, `${name} eye bottom`).toBeLessThanOrEqual(HEAD.y + HEAD.h - 1);
      }
    }
  });

  it('stays legible at the minimum rendered size', () => {
    expect((HEAD.w / VIEWBOX) * 24).toBeGreaterThanOrEqual(7);
    expect((SLOT_SPECS.heart.w / VIEWBOX) * 24).toBeGreaterThanOrEqual(6);
  });
});
