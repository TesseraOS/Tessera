import { assertUsageDay, usageDay, type UsageDay } from '../period.js';
import type {
  UsageAggregate,
  UsageDailyAggregate,
  UsageEvent,
  UsageOperation,
  UsageQuery,
  UsageScope,
  UsageStore,
} from '../ports.js';

/**
 * The in-memory {@link UsageStore} — the **reference implementation**.
 *
 * It is not a stub kept around for convenience: it is the adapter the shared conformance suite is
 * written against, and the one `buildServer`-style compositions without a database use. The SQLite and
 * Postgres adapters must satisfy the same suite unmodified.
 *
 * Not durable: a process restart loses the counters, which is why it is never a profile's choice
 * (`ProfileAdapters` requires a real store from both — ADR-0060 §7).
 */

/** A mutable accumulator; the port's readonly {@link UsageAggregate} is projected out of it. */
interface Bucket {
  tenantId: string;
  projectId: string;
  day: UsageDay;
  operation: UsageOperation;
  count: number;
  tokens: number;
  sumDurationMs: number;
  maxDurationMs: number;
  sumBudgetAdherence: number;
  sumProvenanceCoverage: number;
  scoredCount: number;
}

// NUL cannot occur in a tenant/project id, a day key, or an operation name, so the key is unambiguous;
// a printable separator would let a tenant literally named `a|b` collide with tenant `a` in project
// `b` — a cross-tenant read, which is the one bug class this store must not have.
const SEP = '\u0000';

function keyOf(
  tenantId: string,
  projectId: string,
  day: UsageDay,
  operation: UsageOperation,
): string {
  return [tenantId, projectId, day, operation].join(SEP);
}

function emptyAggregate(operation: UsageOperation): UsageAggregate {
  return {
    operation,
    count: 0,
    tokens: 0,
    sumDurationMs: 0,
    maxDurationMs: 0,
    sumBudgetAdherence: 0,
    sumProvenanceCoverage: 0,
    scoredCount: 0,
  };
}

/** Fold one bucket into a running aggregate (shared by `summarize` and `daily`). */
function accumulate(into: UsageAggregate, bucket: Bucket): UsageAggregate {
  return {
    operation: into.operation,
    count: into.count + bucket.count,
    tokens: into.tokens + bucket.tokens,
    sumDurationMs: into.sumDurationMs + bucket.sumDurationMs,
    maxDurationMs: Math.max(into.maxDurationMs, bucket.maxDurationMs),
    sumBudgetAdherence: into.sumBudgetAdherence + bucket.sumBudgetAdherence,
    sumProvenanceCoverage: into.sumProvenanceCoverage + bucket.sumProvenanceCoverage,
    scoredCount: into.scoredCount + bucket.scoredCount,
  };
}

export function createInMemoryUsageStore(): UsageStore {
  const buckets = new Map<string, Bucket>();

  const matches = (bucket: Bucket, query: UsageQuery): boolean => {
    if (bucket.tenantId !== query.tenantId) return false;
    if (query.projectId !== undefined && bucket.projectId !== query.projectId) return false;
    // Inclusive on BOTH ends: a window of one day must contain that day's rows.
    if (bucket.day < query.from || bucket.day > query.until) return false;
    if (query.operations !== undefined && !query.operations.includes(bucket.operation))
      return false;
    return true;
  };

  const selected = (query: UsageQuery): Bucket[] => {
    assertUsageDay(query.from);
    assertUsageDay(query.until);
    return [...buckets.values()].filter((bucket) => matches(bucket, query));
  };

  return {
    record(event: UsageEvent): Promise<void> {
      const day = usageDay(event.occurredAt);
      const key = keyOf(event.tenantId, event.projectId, day, event.operation);
      const bucket = buckets.get(key) ?? {
        tenantId: event.tenantId,
        projectId: event.projectId,
        day,
        operation: event.operation,
        count: 0,
        tokens: 0,
        sumDurationMs: 0,
        maxDurationMs: 0,
        sumBudgetAdherence: 0,
        sumProvenanceCoverage: 0,
        scoredCount: 0,
      };
      bucket.count += 1;
      bucket.tokens += event.tokens ?? 0;
      bucket.sumDurationMs += event.durationMs;
      bucket.maxDurationMs = Math.max(bucket.maxDurationMs, event.durationMs);
      // Quality proxies travel together (both come off one PackageScores) but are summed independently
      // so a future partial payload degrades rather than corrupts.
      if (event.budgetAdherence !== undefined || event.provenanceCoverage !== undefined) {
        bucket.sumBudgetAdherence += event.budgetAdherence ?? 0;
        bucket.sumProvenanceCoverage += event.provenanceCoverage ?? 0;
        bucket.scoredCount += 1;
      }
      buckets.set(key, bucket);
      return Promise.resolve();
    },

    summarize(query: UsageQuery): Promise<readonly UsageAggregate[]> {
      const byOperation = new Map<UsageOperation, UsageAggregate>();
      for (const bucket of selected(query)) {
        const current = byOperation.get(bucket.operation) ?? emptyAggregate(bucket.operation);
        byOperation.set(bucket.operation, accumulate(current, bucket));
      }
      return Promise.resolve([...byOperation.values()]);
    },

    daily(query: UsageQuery): Promise<readonly UsageDailyAggregate[]> {
      const byDayOperation = new Map<string, UsageDailyAggregate>();
      for (const bucket of selected(query)) {
        const key = `${bucket.day}${SEP}${bucket.operation}`;
        const current = byDayOperation.get(key) ?? {
          ...emptyAggregate(bucket.operation),
          day: bucket.day,
        };
        byDayOperation.set(key, { ...accumulate(current, bucket), day: bucket.day });
      }
      return Promise.resolve(
        [...byDayOperation.values()].sort(
          (a, b) => a.day.localeCompare(b.day) || a.operation.localeCompare(b.operation),
        ),
      );
    },

    earliestDay(scope: UsageScope): Promise<UsageDay | null> {
      let earliest: UsageDay | null = null;
      for (const bucket of buckets.values()) {
        if (bucket.tenantId !== scope.tenantId) continue;
        if (scope.projectId !== undefined && bucket.projectId !== scope.projectId) continue;
        if (earliest === null || bucket.day < earliest) earliest = bucket.day;
      }
      return Promise.resolve(earliest);
    },
  };
}
