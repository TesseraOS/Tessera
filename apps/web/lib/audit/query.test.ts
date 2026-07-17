import { describe, expect, it } from 'vitest';
import {
  ALL,
  EMPTY_AUDIT_FILTERS,
  dayBoundary,
  hasActiveFilters,
  toAuditQuery,
} from '@/lib/audit/query';

describe('dayBoundary', () => {
  it('makes `until` the END of its day — the silent off-by-one-day', () => {
    // The API compares since/until LEXICOGRAPHICALLY against event.at (always an ISO instant), so a
    // bare `until=2026-07-17` excludes everything ON the 17th:
    //   "2026-07-17T09:00:00.000Z" > "2026-07-17"
    // A compliance officer filtering "up to the 17th" would silently lose the 17th.
    expect(dayBoundary('2026-07-17', 'end')).toBe('2026-07-17T23:59:59.999Z');
    expect('2026-07-17T09:00:00.000Z' <= dayBoundary('2026-07-17', 'end')!).toBe(true);
    // The bug, demonstrated: the naive value would exclude that same event.
    expect('2026-07-17T09:00:00.000Z' <= '2026-07-17').toBe(false);
  });

  it('makes `since` the start of its day (both bounds are inclusive per the API contract)', () => {
    expect(dayBoundary('2026-07-17', 'start')).toBe('2026-07-17T00:00:00.000Z');
    expect('2026-07-17T00:00:00.000Z' >= dayBoundary('2026-07-17', 'start')!).toBe(true);
  });

  it('ignores anything that is not a YYYY-MM-DD', () => {
    for (const bad of ['', '2026-7-1', 'yesterday', '17/07/2026', '2026-07-17T10:00:00Z']) {
      expect(dayBoundary(bad, 'start')).toBeUndefined();
    }
  });
});

describe('toAuditQuery', () => {
  it('is empty when nothing is filtered — never sends the "all" sentinel', () => {
    expect(toAuditQuery(EMPTY_AUDIT_FILTERS)).toEqual({});
  });

  it('carries every set filter', () => {
    expect(
      toAuditQuery({
        action: 'memory.write',
        outcome: 'denied',
        actor: 'admin@acme.test',
        from: '2026-07-01',
        to: '2026-07-17',
      }),
    ).toEqual({
      action: 'memory.write',
      outcome: 'denied',
      actor: 'admin@acme.test',
      since: '2026-07-01T00:00:00.000Z',
      until: '2026-07-17T23:59:59.999Z',
    });
  });

  it('trims the actor and treats blank as unset', () => {
    expect(toAuditQuery({ ...EMPTY_AUDIT_FILTERS, actor: '  admin  ' })).toEqual({
      actor: 'admin',
    });
    expect(toAuditQuery({ ...EMPTY_AUDIT_FILTERS, actor: '   ' })).toEqual({});
  });

  it('sends one bound when only one date is given', () => {
    expect(toAuditQuery({ ...EMPTY_AUDIT_FILTERS, from: '2026-07-01' })).toEqual({
      since: '2026-07-01T00:00:00.000Z',
    });
    expect(toAuditQuery({ ...EMPTY_AUDIT_FILTERS, to: '2026-07-17' })).toEqual({
      until: '2026-07-17T23:59:59.999Z',
    });
  });

  it('drops a malformed date rather than sending it', () => {
    // A bad bound sent to a lexicographic comparison silently returns the wrong set — better to not
    // filter than to filter wrongly and look like it worked.
    expect(toAuditQuery({ ...EMPTY_AUDIT_FILTERS, from: 'nonsense' })).toEqual({});
  });
});

describe('hasActiveFilters', () => {
  it('is false only when nothing narrows the trail', () => {
    expect(hasActiveFilters(EMPTY_AUDIT_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_AUDIT_FILTERS, action: 'search' })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_AUDIT_FILTERS, actor: 'a' })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_AUDIT_FILTERS, from: '2026-07-01' })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_AUDIT_FILTERS, actor: '   ' })).toBe(false); // blank ≠ set
    expect(hasActiveFilters({ ...EMPTY_AUDIT_FILTERS, outcome: ALL })).toBe(false);
  });
});
