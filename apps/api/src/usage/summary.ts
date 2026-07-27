import type { ProjectId, TenantId } from '@tessera/core';
import {
  usageMonthWindow,
  usageTrailingWindow,
  type UsageAggregate,
  type UsageOperation,
  type UsageStore,
} from '@tessera/billing';
import type { BillingProvider } from '@tessera/billing';
import { effectiveEntitlements } from '@tessera/billing';

/**
 * The `GET /v1/usage` aggregation (F-057; FR-47, NFR-12) — **Fastify-free**, so the route is a thin
 * shell and a future caller (an MCP tool, a CLI) would share one engine rather than growing a second.
 * That is the `computeWorkspaceStats` precedent (ADR-0036).
 *
 * Two honesty rules are enforced here rather than in the view:
 *
 * - **The window returned is the window used.** Clamped to the earliest day the store actually holds,
 *   so a 90-day request against a 3-day-old deployment does not render 87 days of zeros that read as
 *   "nothing happened" (ADR-0053 clause 3).
 * - **Averages over an empty set are `null`, never `0`.** A quality average of zero is a claim about
 *   compiles that never happened.
 */

export const DEFAULT_USAGE_DAYS = 30;
export const MAX_USAGE_DAYS = 365;

export interface UsageLatency {
  /** Mean duration. **Not a percentile** — see ADR-0060 §3; the surfaces label this "average". */
  readonly avgMs: number;
  /** The slowest single occurrence in the window. */
  readonly maxMs: number;
}

export interface UsageTotals {
  readonly compiles: number;
  readonly searches: number;
  readonly documentsIngested: number;
  readonly memoriesWritten: number;
  readonly tokensCompiled: number;
}

export interface UsageDailyPoint {
  readonly date: string;
  readonly compiles: number;
  readonly searches: number;
  readonly documentsIngested: number;
  readonly tokensCompiled: number;
}

export interface UsageEntitlement {
  /** `-1` means unlimited (enterprise). */
  readonly maxMonthlyCompiles: number;
  /** Compiles this tenant has spent in the current UTC calendar month, across every project. */
  readonly compilesUsed: number;
  /** The current entitlement period (UTC calendar month), as `YYYY-MM-DD` day keys. */
  readonly periodStart: string;
  readonly periodEnd: string;
}

export interface UsageSummary {
  /** The window the server ACTUALLY used — clamped to the store's earliest day. Label this one. */
  readonly from: string;
  readonly until: string;
  readonly totals: UsageTotals;
  /** `null` when the deployment is unmetered (ADR-0060 §1) — there is no entitlement to report. */
  readonly entitlement: UsageEntitlement | null;
  readonly latency: {
    readonly compile: UsageLatency | null;
    readonly search: UsageLatency | null;
  };
  /** `null` when no compile in the window carried scores — a zero average would be a lie. */
  readonly quality: {
    readonly avgBudgetAdherence: number;
    readonly avgProvenanceCoverage: number;
  } | null;
  readonly daily: readonly UsageDailyPoint[];
}

export interface ComputeUsageOptions {
  readonly days?: number;
  readonly projectId?: ProjectId;
  /** Present ⇒ the entitlement block is reported. Absent ⇒ unmetered, and it is `null`. */
  readonly billing?: BillingProvider;
  readonly metered?: boolean;
  readonly now?: () => Date;
}

const countOf = (aggregates: readonly UsageAggregate[], operation: UsageOperation): number =>
  aggregates.find((aggregate) => aggregate.operation === operation)?.count ?? 0;

const latencyOf = (
  aggregates: readonly UsageAggregate[],
  operation: UsageOperation,
): UsageLatency | null => {
  const aggregate = aggregates.find((candidate) => candidate.operation === operation);
  if (aggregate === undefined || aggregate.count === 0) return null;
  return { avgMs: aggregate.sumDurationMs / aggregate.count, maxMs: aggregate.maxDurationMs };
};

/** Aggregate one tenant's usage into the `GET /v1/usage` response shape. */
export async function computeUsageSummary(
  usage: UsageStore,
  tenantId: TenantId,
  options: ComputeUsageOptions = {},
): Promise<UsageSummary> {
  const {
    days = DEFAULT_USAGE_DAYS,
    projectId,
    billing,
    metered = false,
    now = () => new Date(),
  } = options;
  const at = now().toISOString();

  const requested = usageTrailingWindow(at, Math.min(Math.max(days, 1), MAX_USAGE_DAYS));
  const scope = { tenantId, ...(projectId !== undefined ? { projectId } : {}) };
  const earliest = await usage.earliestDay(scope);
  // The clamp: never claim a window the store cannot speak for. An empty store reports the requested
  // window with empty data rather than inventing a floor.
  const from = earliest !== null && earliest > requested.from ? earliest : requested.from;
  const window = { ...scope, from, until: requested.until };

  const [aggregates, daily] = await Promise.all([usage.summarize(window), usage.daily(window)]);

  const compile = aggregates.find((aggregate) => aggregate.operation === 'compile');
  const scoredCount = compile?.scoredCount ?? 0;

  const byDay = new Map<string, UsageDailyPoint>();
  for (const row of daily) {
    const current = byDay.get(row.day) ?? {
      date: row.day,
      compiles: 0,
      searches: 0,
      documentsIngested: 0,
      tokensCompiled: 0,
    };
    byDay.set(row.day, {
      date: row.day,
      compiles: current.compiles + (row.operation === 'compile' ? row.count : 0),
      searches: current.searches + (row.operation === 'search' ? row.count : 0),
      documentsIngested: current.documentsIngested + (row.operation === 'ingest' ? row.count : 0),
      tokensCompiled: current.tokensCompiled + (row.operation === 'compile' ? row.tokens : 0),
    });
  }

  let entitlement: UsageEntitlement | null = null;
  if (billing !== undefined && metered) {
    const period = usageMonthWindow(at);
    // Tenant-wide, NOT project-scoped: a subscription is per tenant (ADR-0060 §4).
    const monthly = await usage.summarize({
      tenantId,
      from: period.from,
      until: period.until,
      operations: ['compile'],
    });
    entitlement = {
      maxMonthlyCompiles: effectiveEntitlements(await billing.getSubscription(tenantId))
        .maxMonthlyCompiles,
      compilesUsed: monthly.reduce((total, aggregate) => total + aggregate.count, 0),
      periodStart: period.from,
      periodEnd: period.until,
    };
  }

  return {
    from,
    until: requested.until,
    totals: {
      compiles: countOf(aggregates, 'compile'),
      searches: countOf(aggregates, 'search'),
      documentsIngested: countOf(aggregates, 'ingest'),
      memoriesWritten: countOf(aggregates, 'memory.write'),
      tokensCompiled: compile?.tokens ?? 0,
    },
    entitlement,
    latency: {
      compile: latencyOf(aggregates, 'compile'),
      search: latencyOf(aggregates, 'search'),
    },
    quality:
      scoredCount === 0 || compile === undefined
        ? null
        : {
            avgBudgetAdherence: compile.sumBudgetAdherence / scoredCount,
            avgProvenanceCoverage: compile.sumProvenanceCoverage / scoredCount,
          },
    daily: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
