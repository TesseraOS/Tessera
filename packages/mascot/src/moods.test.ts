import { describe, expect, it } from 'vitest';
import { SLOTS } from './geometry.js';
import { CORE_MOODS, MOODS, SURFACE_MOODS, THERMAL, defineMood, isMoodName } from './moods.js';

const ALL_NAMES = [...CORE_MOODS, ...SURFACE_MOODS];

describe('the mood registry (ADR-0046)', () => {
  it('ships exactly the locked core + surface sets', () => {
    expect(CORE_MOODS).toEqual([
      'idle',
      'curious',
      'working',
      'satisfied',
      'alarmed',
      'celebrating',
    ]);
    expect(SURFACE_MOODS).toEqual(['greeting', 'lost', 'searching', 'watching']);
    expect(Object.keys(MOODS).sort()).toEqual([...ALL_NAMES].sort());
  });

  it('covers every slot in every mood (the still pose is complete by construction)', () => {
    for (const name of ALL_NAMES) {
      for (const slot of SLOTS) {
        expect(MOODS[name].poses[slot], `${name}.${slot}`).toBeDefined();
      }
    }
  });

  it('keeps every pose and rhythm inside the thermal budgets', () => {
    for (const name of ALL_NAMES) {
      const mood = MOODS[name];
      for (const slot of SLOTS) {
        const pose = mood.poses[slot];
        expect(Math.abs(pose.dx), `${name}.${slot}.dx`).toBeLessThanOrEqual(THERMAL.maxOffset);
        expect(Math.abs(pose.dy), `${name}.${slot}.dy`).toBeLessThanOrEqual(THERMAL.maxOffset);
        expect(Math.abs(pose.rotate), `${name}.${slot}.rotate`).toBeLessThanOrEqual(
          THERMAL.maxRotate,
        );
        expect(pose.scale, `${name}.${slot}.scale`).toBeGreaterThanOrEqual(THERMAL.minScale);
        expect(pose.scale, `${name}.${slot}.scale`).toBeLessThanOrEqual(THERMAL.maxScale);
        expect(pose.opacity, `${name}.${slot}.opacity`).toBeGreaterThanOrEqual(0);
        expect(pose.opacity, `${name}.${slot}.opacity`).toBeLessThanOrEqual(1);
      }
      expect(mood.rhythm.breathPeriodMs).toBeGreaterThanOrEqual(THERMAL.breathMinMs);
      expect(mood.rhythm.breathPeriodMs).toBeLessThanOrEqual(THERMAL.breathMaxMs);
      expect(mood.rhythm.driftAmp).toBeLessThanOrEqual(THERMAL.maxDrift);
    }
  });

  it('always keeps the gilded heart present', () => {
    for (const name of ALL_NAMES) {
      const heart = MOODS[name].poses.heart;
      expect(heart.opacity, `${name}.heart.opacity`).toBeGreaterThanOrEqual(0.9);
      expect(heart.role, `${name}.heart.role`).toBe('heart');
    }
  });

  it('gives every mood an in-budget face (ADR-0046 v2)', () => {
    for (const name of ALL_NAMES) {
      const { eyes } = MOODS[name];
      expect(eyes.openness, `${name}.openness`).toBeGreaterThanOrEqual(THERMAL.minOpenness);
      expect(eyes.openness, `${name}.openness`).toBeLessThanOrEqual(THERMAL.maxOpenness);
      expect(Math.abs(eyes.gazeX), `${name}.gazeX`).toBeLessThanOrEqual(THERMAL.maxGaze);
      expect(Math.abs(eyes.gazeY), `${name}.gazeY`).toBeLessThanOrEqual(THERMAL.maxGaze);
    }
    // The face expresses: alarm is wide-eyed, joy and contentment squint below neutral.
    expect(MOODS.alarmed.eyes.openness).toBeGreaterThan(1.2);
    expect(MOODS.celebrating.eyes.openness).toBeLessThan(0.7);
    expect(MOODS.satisfied.eyes.openness).toBeLessThan(0.7);
  });

  it('gives every mood a text alternative', () => {
    for (const name of ALL_NAMES) {
      expect(MOODS[name].description.trim().length).toBeGreaterThan(10);
    }
  });

  it('expresses the brand channels: satisfied is a seated grid, lost misses a tile', () => {
    for (const slot of SLOTS) {
      const pose = MOODS.satisfied.poses[slot];
      expect([pose.dx, pose.dy, pose.rotate], `satisfied.${slot}`).toEqual([0, 0, 0]);
    }
    const socket = SLOTS.filter((slot) => MOODS.lost.poses[slot].opacity <= 0.2);
    expect(socket, 'lost renders exactly one empty socket').toHaveLength(1);
    const popped = SLOTS.filter((slot) => {
      const p = MOODS.alarmed.poses[slot];
      return Math.abs(p.dx) + Math.abs(p.dy) > 8;
    });
    expect(popped, 'alarmed pops exactly one tile out of place').toHaveLength(1);
  });

  it('freezes the registry data', () => {
    expect(Object.isFrozen(MOODS)).toBe(true);
    expect(Object.isFrozen(MOODS.idle)).toBe(true);
    expect(Object.isFrozen(MOODS.idle.poses)).toBe(true);
  });
});

describe('defineMood validation', () => {
  const rhythm = { breathPeriodMs: 4000, breathIntensity: 0.5, driftAmp: 2 };

  it('accepts a sparse, in-budget custom mood and fills the seated defaults', () => {
    const mood = defineMood({
      name: 'docs-waiting',
      description: 'Tess waits patiently beside the docs search.',
      poses: { crown: { rotate: 4 } },
      rhythm,
    });
    expect(mood.poses.crown.rotate).toBe(4);
    expect(mood.poses.core).toEqual({
      dx: 0,
      dy: 0,
      rotate: 0,
      scale: 1,
      opacity: 0.92,
      role: 'tile',
    });
    // The face defaults to neutral open eyes looking ahead.
    expect(mood.eyes).toEqual({ openness: 1, gazeX: 0, gazeY: 0 });
  });

  it('rejects non-kebab names', () => {
    expect(() => defineMood({ name: 'Not Kebab', description: 'x y z', rhythm })).toThrow(
      /kebab-case/,
    );
  });

  it('rejects a missing description', () => {
    expect(() => defineMood({ name: 'quiet', description: '  ', rhythm })).toThrow(
      /text alternative/,
    );
  });

  it('rejects unknown slots', () => {
    expect(() =>
      defineMood({
        name: 'quiet',
        description: 'a mood with an impossible slot',
        poses: { tail: { dx: 1 } } as never,
        rhythm,
      }),
    ).toThrow(/unknown slot "tail"/);
  });

  it('rejects out-of-budget offsets, rotation, scale, breath, drift, and face', () => {
    const base = { name: 'quiet', description: 'over budget in one way or another' };
    expect(() => defineMood({ ...base, poses: { crown: { dx: 13 } }, rhythm })).toThrow(/offset/);
    expect(() => defineMood({ ...base, poses: { crown: { rotate: 21 } }, rhythm })).toThrow(
      /rotation/,
    );
    expect(() => defineMood({ ...base, poses: { crown: { scale: 1.2 } }, rhythm })).toThrow(
      /scale/,
    );
    expect(() => defineMood({ ...base, rhythm: { ...rhythm, breathPeriodMs: 2000 } })).toThrow(
      /breath period/,
    );
    expect(() => defineMood({ ...base, rhythm: { ...rhythm, breathPeriodMs: 9000 } })).toThrow(
      /breath period/,
    );
    expect(() => defineMood({ ...base, rhythm: { ...rhythm, driftAmp: 7 } })).toThrow(/drift/);
    expect(() => defineMood({ ...base, eyes: { openness: 1.6 }, rhythm })).toThrow(/openness/);
    expect(() => defineMood({ ...base, eyes: { gazeX: 3.1 }, rhythm })).toThrow(/gaze/);
  });

  it('rejects a vanished heart', () => {
    expect(() =>
      defineMood({
        name: 'heartless',
        description: 'the heart must never disappear',
        poses: { heart: { opacity: 0.5 } },
        rhythm,
      }),
    ).toThrow(/heart/);
  });

  it('exposes the registry membership check', () => {
    expect(isMoodName('watching')).toBe(true);
    expect(isMoodName('sleeping')).toBe(false);
  });
});
