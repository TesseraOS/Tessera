import type { TenantId } from '@tessera/core';
import type { AuditLog } from '../audit/index.js';

/**
 * The Overview activity chart's data (F-084; ADR-0053 clause 3) — Fastify-free so the route is a thin
 * shell, mirroring {@link import('./core.js').computeWorkspaceStats}.
 *
 * **The honesty rule lives here.** The audit trail is pruned (`AuditLog.prune` + retention), so a
 * naive "last N days" histogram would draw zeros for pruned days — and a zero meaning "we deleted the
 * record" is indistinguishable from "nothing happened". So the window's start is clamped to the
 * oldest event the trail actually holds, and the `from` we actually used is returned for the client
 * to label — never the requested one. Derived from the *data* (the trail's own `earliest`), not from
 * `config.audit.retention`, which is the only form that survives `maxEntries` pruning.
 */

export interface ActivityPoint {
  /** UTC calendar day, `YYYY-MM-DD`. */
  readonly date: string;
  readonly count: number;
}

export interface WorkspaceActivity {
  /** The window start actually used: `max(requestedStart, oldestRetainedEvent)`. Label this, not the request. */
  readonly from: string;
  /** The window end (inclusive), UTC day. */
  readonly until: string;
  /** One contiguous point per UTC day in `[from, until]`, zero-filled. Empty when the trail is empty. */
  readonly points: readonly ActivityPoint[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const DEFAULT_ACTIVITY_DAYS = 30;
export const MAX_ACTIVITY_DAYS = 365;

/** The UTC calendar day of an instant, `YYYY-MM-DD`. */
function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Every UTC day from `fromDay` to `untilDay` inclusive, ascending. Pure calendar math — filling a day
 * inside the retained window with a real `0` is not fabrication; emitting a day *before* `from` would
 * be, and this never does (the caller passes the clamped `from`).
 */
function fillDays(fromDay: string, untilDay: string, counts: Map<string, number>): ActivityPoint[] {
  const points: ActivityPoint[] = [];
  // Parse as UTC midnight; step a day at a time. Bounded by MAX_ACTIVITY_DAYS at the call site.
  for (let ms = Date.parse(`${fromDay}T00:00:00.000Z`); utcDay(ms) <= untilDay; ms += MS_PER_DAY) {
    const date = utcDay(ms);
    points.push({ date, count: counts.get(date) ?? 0 });
  }
  return points;
}

/**
 * Aggregate one tenant's audit trail into a zero-filled daily activity series (F-084).
 *
 * `days` is the requested window length; the real window is `[max(now-days, oldestEvent), now]`. An
 * empty trail returns an empty `points` — the caller renders the chart only when there is data.
 */
export async function computeWorkspaceActivity(
  audit: AuditLog,
  tenantId: TenantId,
  options: { days?: number; now?: number } = {},
): Promise<WorkspaceActivity> {
  const days = Math.min(Math.max(1, options.days ?? DEFAULT_ACTIVITY_DAYS), MAX_ACTIVITY_DAYS);
  const now = options.now ?? Date.now();
  const untilDay = utcDay(now);
  const requestedFromDay = utcDay(now - (days - 1) * MS_PER_DAY);

  const { buckets, earliest } = await audit
    .forTenant(tenantId)
    .activity({ since: `${requestedFromDay}T00:00:00.000Z`, until: `${untilDay}T23:59:59.999Z` });

  // An empty trail proves nothing about any day — return no points, so the chart stays hidden rather
  // than drawing a flat zero line across a window the workspace has no history for.
  if (earliest === null) {
    return { from: requestedFromDay, until: untilDay, points: [] };
  }

  // The clamp (ADR-0053 clause 3): never start earlier than the trail's oldest day. If the trail
  // goes back further than requested, the request wins; if it is younger, the trail's floor wins.
  const earliestDay = earliest.slice(0, 10);
  const fromDay = earliestDay > requestedFromDay ? earliestDay : requestedFromDay;

  const counts = new Map(buckets.map((bucket) => [bucket.date, bucket.count]));
  return { from: fromDay, until: untilDay, points: fillDays(fromDay, untilDay, counts) };
}
