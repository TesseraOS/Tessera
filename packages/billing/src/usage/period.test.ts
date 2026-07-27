import { describe, expect, it } from 'vitest';
import { ValidationError } from '@tessera/core';
import {
  assertUsageDay,
  usageDay,
  usageMonthResetAt,
  usageMonthWindow,
  usageTrailingWindow,
} from './period.js';

describe('usageDay', () => {
  it('buckets an instant into its UTC day', () => {
    expect(usageDay('2026-05-04T10:00:00.000Z')).toBe('2026-05-04');
  });

  it('keeps the last millisecond of a UTC day out of the next one', () => {
    // Mutation check: `>=`/`<=` slips or a calendar-getter implementation move these across the
    // boundary. The pair matters — one instant alone cannot distinguish an off-by-one from a shift.
    expect(usageDay('2026-05-04T23:59:59.999Z')).toBe('2026-05-04');
    expect(usageDay('2026-05-05T00:00:00.000Z')).toBe('2026-05-05');
  });

  it('rejects an unparseable timestamp instead of bucketing into NaN', () => {
    expect(() => usageDay('not-a-date')).toThrow(ValidationError);
  });
});

describe('assertUsageDay', () => {
  it('accepts a YYYY-MM-DD key', () => {
    expect(assertUsageDay('2026-05-04')).toBe('2026-05-04');
  });

  it.each(['2026-5-4', '2026-05-04T00:00:00Z', '20260504', '', '2026-13-01'])(
    'rejects %j',
    (bad) => {
      expect(() => assertUsageDay(bad)).toThrow(ValidationError);
    },
  );
});

describe('usageMonthWindow', () => {
  it('spans the whole calendar month, inclusive of the last day', () => {
    expect(usageMonthWindow('2026-05-04T10:00:00.000Z')).toEqual({
      from: '2026-05-01',
      until: '2026-05-31',
    });
  });

  it('gets February right in a leap year and a common year', () => {
    // Day 0 of the next month, rather than a hard-coded length table — this is the assertion that
    // proves it. Mutation check: `until = from + 30 days` turns both of these red.
    expect(usageMonthWindow('2028-02-15T00:00:00.000Z').until).toBe('2028-02-29');
    expect(usageMonthWindow('2026-02-15T00:00:00.000Z').until).toBe('2026-02-28');
  });

  it('measures the month an instant falls in by UTC, not by the host offset', () => {
    // 2026-05-31T23:30Z is already June for any host east of UTC (+05:30 here). Honest caveat: on a
    // UTC host this degrades to a tautology, as in the store conformance suite.
    expect(usageMonthWindow('2026-05-31T23:30:00.000Z')).toEqual({
      from: '2026-05-01',
      until: '2026-05-31',
    });
  });

  it('does not roll December into month 13', () => {
    expect(usageMonthWindow('2026-12-09T00:00:00.000Z')).toEqual({
      from: '2026-12-01',
      until: '2026-12-31',
    });
  });
});

describe('usageMonthResetAt', () => {
  it('is the start of the next UTC month', () => {
    expect(usageMonthResetAt('2026-05-04T10:00:00.000Z')).toBe('2026-06-01T00:00:00.000Z');
  });

  it('crosses the year boundary', () => {
    expect(usageMonthResetAt('2026-12-31T23:59:59.999Z')).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('usageTrailingWindow', () => {
  it('includes both ends, so N days means N days', () => {
    // Mutation check: dropping the `- 1` returns 31 days for a 30-day window — the off-by-one that
    // would make every "last 30 days" total quietly wrong.
    expect(usageTrailingWindow('2026-05-30T12:00:00.000Z', 30)).toEqual({
      from: '2026-05-01',
      until: '2026-05-30',
    });
  });

  it('handles a single-day window', () => {
    expect(usageTrailingWindow('2026-05-30T12:00:00.000Z', 1)).toEqual({
      from: '2026-05-30',
      until: '2026-05-30',
    });
  });

  it('walks back across a month boundary', () => {
    expect(usageTrailingWindow('2026-03-02T00:00:00.000Z', 7).from).toBe('2026-02-24');
  });

  it('rejects a non-positive or fractional window', () => {
    expect(() => usageTrailingWindow('2026-05-30T12:00:00.000Z', 0)).toThrow(ValidationError);
    expect(() => usageTrailingWindow('2026-05-30T12:00:00.000Z', -7)).toThrow(ValidationError);
    expect(() => usageTrailingWindow('2026-05-30T12:00:00.000Z', 1.5)).toThrow(ValidationError);
  });
});
