import type { AuditAction, AuditOutcome, AuditQuery } from '@/lib/api/types';

/**
 * Build an {@link AuditQuery} from what the filter bar holds (F-063). Pure, so the date handling —
 * the part with a silent trap in it — unit-tests without a render.
 */

/** The sentinel a Select uses for "no filter"; never sent to the API. */
export const ALL = 'all';

export interface AuditFilters {
  readonly action: AuditAction | typeof ALL;
  readonly outcome: AuditOutcome | typeof ALL;
  /** Free-text actor principal id; blank means no filter. */
  readonly actor: string;
  /** `<input type="date">` values, i.e. `YYYY-MM-DD` in the user's local reckoning, or blank. */
  readonly from: string;
  readonly to: string;
}

export const EMPTY_AUDIT_FILTERS: AuditFilters = {
  action: ALL,
  outcome: ALL,
  actor: '',
  from: '',
  to: '',
};

/**
 * Turn a `YYYY-MM-DD` into the ISO instant the API compares against.
 *
 * **`until` must be the END of its day, and this is a real trap rather than a nicety.** The API
 * compares `since`/`until` **lexicographically** against `event.at`, which is always
 * `new Date().toISOString()` — so a bare `until=2026-07-17` excludes everything that happened *on*
 * the 17th, because `"2026-07-17T09:00:00.000Z" > "2026-07-17"`. A compliance officer filtering "up
 * to the 17th" would silently lose the 17th, and nothing would look wrong.
 *
 * Both bounds are inclusive per the API's own contract, so `from` is the start of its day.
 */
export function dayBoundary(day: string, edge: 'start' | 'end'): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(day)) return undefined;
  return edge === 'start' ? `${day}T00:00:00.000Z` : `${day}T23:59:59.999Z`;
}

/** The query for `GET /v1/audit` (and, minus paging, for the export). Omits every unset filter. */
export function toAuditQuery(filters: AuditFilters): AuditQuery {
  const since = dayBoundary(filters.from, 'start');
  const until = dayBoundary(filters.to, 'end');
  const actor = filters.actor.trim();

  return {
    ...(filters.action !== ALL ? { action: filters.action } : {}),
    ...(filters.outcome !== ALL ? { outcome: filters.outcome } : {}),
    ...(actor.length > 0 ? { actor } : {}),
    ...(since !== undefined ? { since } : {}),
    ...(until !== undefined ? { until } : {}),
  };
}

/** True when any filter narrows the trail — drives the "clear filters" affordance and copy. */
export function hasActiveFilters(filters: AuditFilters): boolean {
  return (
    filters.action !== ALL ||
    filters.outcome !== ALL ||
    filters.actor.trim().length > 0 ||
    filters.from.length > 0 ||
    filters.to.length > 0
  );
}
