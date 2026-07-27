import { ValidationError } from '@tessera/core';

/**
 * UTC day/month arithmetic for usage buckets (ADR-0060 §4).
 *
 * Every bucket boundary in the system is **UTC**, deliberately and irreversibly: pre-aggregation makes
 * the choice at write time, so it cannot be undone at read time. The alternative — hourly buckets rolled
 * into the viewer's offset, as the Overview activity chart does (F-088) — cannot serve `+05:30` or
 * `+05:45`, because an hour bucket cannot be split. The cost is two day-boundary definitions in one
 * product; it is paid by *labelling* the analytics view UTC, not by hiding it.
 */

/** A `YYYY-MM-DD` UTC day key. */
export type UsageDay = string;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function instant(iso: string): Date {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    throw new ValidationError(`invalid usage timestamp: ${iso}`);
  }
  return at;
}

/**
 * The UTC day an instant falls in. `toISOString` is UTC by construction, so there is no local-time
 * path to get wrong here — the risk this guards against lives in any adapter that re-derives a day
 * from calendar getters instead of calling this.
 */
export function usageDay(iso: string): UsageDay {
  return instant(iso).toISOString().slice(0, 10);
}

/** Assert a `YYYY-MM-DD` day key at a trust boundary (query parameters, adapter rows). */
export function assertUsageDay(day: string): UsageDay {
  if (!DAY_PATTERN.test(day) || Number.isNaN(new Date(`${day}T00:00:00.000Z`).getTime())) {
    throw new ValidationError(`invalid usage day (expected YYYY-MM-DD): ${day}`);
  }
  return day;
}

/** An inclusive `[from, until]` window of UTC day keys. */
export interface UsageDayWindow {
  readonly from: UsageDay;
  readonly until: UsageDay;
}

/**
 * The calendar month (UTC) an instant falls in — the window the monthly compile entitlement is
 * measured over. Inclusive of both ends, so the last day of the month is counted.
 */
export function usageMonthWindow(iso: string): UsageDayWindow {
  const at = instant(iso);
  const year = at.getUTCFullYear();
  const month = at.getUTCMonth();
  const from = new Date(Date.UTC(year, month, 1));
  // Day 0 of the *next* month is the last day of this one — correct across leap years by construction.
  const until = new Date(Date.UTC(year, month + 1, 0));
  return {
    from: from.toISOString().slice(0, 10),
    until: until.toISOString().slice(0, 10),
  };
}

/**
 * The instant the current entitlement period rolls over — the start of the next UTC month. Reported to
 * a caller refused by the monthly guard, so it knows when it may retry rather than having to guess.
 */
export function usageMonthResetAt(iso: string): string {
  const at = instant(iso);
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1)).toISOString();
}

/** A window of the last `days` UTC days, ending on the day `iso` falls in (inclusive of both ends). */
export function usageTrailingWindow(iso: string, days: number): UsageDayWindow {
  if (!Number.isInteger(days) || days < 1) {
    throw new ValidationError(`usage window must be a positive whole number of days: ${days}`);
  }
  const at = instant(iso);
  const until = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const from = new Date(until.getTime());
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return {
    from: from.toISOString().slice(0, 10),
    until: until.toISOString().slice(0, 10),
  };
}
