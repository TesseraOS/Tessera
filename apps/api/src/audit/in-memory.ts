import { DEFAULT_TENANT_ID, type TenantId } from '@tessera/core';
import {
  ACTIVITY_ACTIONS,
  DEFAULT_AUDIT_PAGE_SIZE,
  MAX_AUDIT_PAGE_SIZE,
  toAuditEvent,
  type ActivityResult,
  type AuditEvent,
  type AuditPage,
  type AuditQuery,
} from './model.js';
import type { AuditLog } from './port.js';

/** An event plus its monotonic sequence — the stable, append-safe pagination cursor. */
interface Entry {
  readonly seq: number;
  readonly event: AuditEvent;
}

/** Whether an event passes a query's filters. ISO timestamps compare lexicographically (UTC 'Z'). */
function matches(event: AuditEvent, query: AuditQuery): boolean {
  if (query.action !== undefined && event.action !== query.action) return false;
  if (query.actor !== undefined && event.actor.principalId !== query.actor) return false;
  if (query.outcome !== undefined && event.outcome !== query.outcome) return false;
  if (query.since !== undefined && event.at < query.since) return false;
  if (query.until !== undefined && event.at > query.until) return false;
  return true;
}

/**
 * In-memory {@link AuditLog} — the reference adapter driving the conformance suite. Events are held
 * per tenant in append order with a monotonic `seq`; queries return them **newest-first** and paginate
 * by a `seq` cursor (`seq < cursor`), which is stable against concurrent appends (new events get a
 * higher `seq`, so they never shift an in-progress page).
 */
export function createInMemoryAuditLog(): AuditLog {
  const byTenant = new Map<TenantId, Entry[]>();
  let seq = 0;

  function entriesFor(tenantId: TenantId): Entry[] {
    let entries = byTenant.get(tenantId);
    if (entries === undefined) {
      entries = [];
      byTenant.set(tenantId, entries);
    }
    return entries;
  }

  function storeFor(tenantId: TenantId): AuditLog {
    const entries = entriesFor(tenantId);
    return {
      record(input) {
        seq += 1;
        // Stamp the bound tenant so a record can never be written into another tenant's trail.
        entries.push({ seq, event: toAuditEvent({ ...input, tenantId }) });
        return Promise.resolve();
      },

      query(query = {}) {
        const limit = Math.min(query.limit ?? DEFAULT_AUDIT_PAGE_SIZE, MAX_AUDIT_PAGE_SIZE);
        const before =
          query.cursor === undefined ? Number.POSITIVE_INFINITY : Number(query.cursor) || 0;
        const matched = entries
          .filter((entry) => entry.seq < before && matches(entry.event, query))
          .sort((a, b) => b.seq - a.seq);
        const page = matched.slice(0, limit);
        const hasMore = matched.length > limit;
        const last = page[page.length - 1];
        const result: AuditPage =
          hasMore && last !== undefined
            ? { events: page.map((entry) => entry.event), nextCursor: String(last.seq) }
            : { events: page.map((entry) => entry.event) };
        return Promise.resolve(result);
      },

      activity(query) {
        const actions = new Set(query.actions ?? ACTIVITY_ACTIONS);
        const offsetMs = (query.tzOffsetMinutes ?? 0) * 60_000;
        const counts = new Map<string, number>();
        let earliest: string | null = null;

        for (const { event } of entries) {
          // `earliest` is the retention floor: the oldest event of ANY action (pruning does not
          // discriminate by action), so a chart never claims to know a day that was pruned away.
          if (earliest === null || event.at < earliest) earliest = event.at;

          if (!actions.has(event.action)) continue;
          if (event.at < query.since || event.at > query.until) continue;
          // The viewer's calendar day (F-088): shift the instant by the offset, then read the date.
          // Offset 0 = the UTC day, byte-identical to the pre-F-088 `at.slice(0, 10)`.
          const day = new Date(Date.parse(event.at) + offsetMs).toISOString().slice(0, 10);
          counts.set(day, (counts.get(day) ?? 0) + 1);
        }

        const buckets = [...counts.entries()]
          .map(([date, count]) => ({ date, count }))
          .sort((a, b) => (a.date < b.date ? -1 : 1));
        const result: ActivityResult = { buckets, earliest };
        return Promise.resolve(result);
      },

      prune(policy) {
        const before = entries.length;
        const cutoff = policy.maxAgeMs === undefined ? undefined : Date.now() - policy.maxAgeMs;
        let kept =
          cutoff === undefined ? entries : entries.filter((e) => Date.parse(e.event.at) >= cutoff);
        // Cap to the most-recent maxEntries (highest seq).
        if (policy.maxEntries !== undefined && kept.length > policy.maxEntries) {
          kept = [...kept].sort((a, b) => a.seq - b.seq).slice(kept.length - policy.maxEntries);
        }
        entries.length = 0;
        entries.push(...kept);
        return Promise.resolve(before - entries.length);
      },

      forTenant(next) {
        return storeFor(next);
      },
    };
  }

  return storeFor(DEFAULT_TENANT_ID);
}
