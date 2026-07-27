import type { ProjectId, TenantId } from '@tessera/core';
import type { UsageDay } from './period.js';

/**
 * Per-tenant usage metering (NFR-12; ADR-0060).
 *
 * This port lives in `@tessera/billing` **beside the entitlements it exists to serve** — a counter and
 * the limit it is measured against belong in one package, or they drift. It is deliberately not a
 * metrics system: the operation set is closed and enumerated below, aggregation is `SUM`/`GROUP BY` at
 * the store, and there are no percentiles (see {@link UsageAggregate}).
 */

/** The closed set of metered operations. Adding one is an ADR-0060 amendment, not a casual edit. */
export const USAGE_OPERATIONS = ['compile', 'search', 'ingest', 'memory.write'] as const;

export type UsageOperation = (typeof USAGE_OPERATIONS)[number];

/**
 * One metered occurrence, shaped at a surface boundary by `createUsageRecorder`.
 *
 * **There is no `principalId`, deliberately** (ADR-0060 §4). With one, an aggregate counter becomes
 * personal data subject to NFR-13 DSR *export and erasure* — and honouring an erasure would destroy the
 * billing evidence the counter exists to be. "Who did this" is already answered by the audit trail.
 * A future feature that adds this field silently pulls the store into DSR scope; effect E-029 records it.
 */
export interface UsageEvent {
  readonly tenantId: TenantId;
  /** Recorded so analytics can scope to a project; the monthly entitlement sums *across* projects. */
  readonly projectId: ProjectId;
  readonly operation: UsageOperation;
  /** ISO 8601 instant. The store buckets it into a UTC day (ADR-0060 §4). */
  readonly occurredAt: string;
  /** Wall-clock duration of the operation, in milliseconds. */
  readonly durationMs: number;
  /** Tokens compiled — `compile` only. */
  readonly tokens?: number;
  /** FR-47 retrieval-quality proxies, straight off `PackageScores` — `compile` only. */
  readonly budgetAdherence?: number;
  readonly provenanceCoverage?: number;
}

/** An inclusive window over UTC day buckets, optionally narrowed to a project and/or operations. */
export interface UsageQuery {
  readonly tenantId: TenantId;
  /** Omit to aggregate across **every** project in the tenant — what the monthly entitlement does. */
  readonly projectId?: ProjectId;
  readonly from: UsageDay;
  readonly until: UsageDay;
  /** Omit for every operation. */
  readonly operations?: readonly UsageOperation[];
}

/**
 * A per-operation aggregate over a window.
 *
 * **Counters only — there is no percentile here, and that is a decision** (ADR-0060 §3). A sum and a max
 * cannot produce a p95; reporting a mean under that name would be fabrication. The surfaces label these
 * "average" and "slowest". True percentiles live in the gated `bench` suite against NFR-4.
 */
export interface UsageAggregate {
  readonly operation: UsageOperation;
  readonly count: number;
  /** Summed {@link UsageEvent.tokens}; `0` for operations that carry none. */
  readonly tokens: number;
  readonly sumDurationMs: number;
  readonly maxDurationMs: number;
  readonly sumBudgetAdherence: number;
  readonly sumProvenanceCoverage: number;
  /**
   * How many events carried the quality proxies — the divisor for their averages. Dividing by
   * {@link UsageAggregate.count} instead would silently deflate the average with every unscored event.
   */
  readonly scoredCount: number;
}

/** A {@link UsageAggregate} for one UTC day, for the analytics time series. */
export interface UsageDailyAggregate extends UsageAggregate {
  readonly day: UsageDay;
}

/** The scope an {@link UsageStore.earliestDay} lookup applies to. */
export interface UsageScope {
  readonly tenantId: TenantId;
  readonly projectId?: ProjectId;
}

/**
 * Persistence for {@link UsageEvent}s, pre-aggregated into `(tenant, project, day, operation)` buckets.
 *
 * Every adapter satisfies one shared conformance suite
 * (`tests/conformance/usage-store.conformance.ts`) — the property F-078 exists for the lack of. If a
 * suite has to change to accommodate an adapter, that is a finding, not a task.
 */
export interface UsageStore {
  /** Accumulate one occurrence into its bucket. Idempotent per call, never per event id — this counts. */
  record(event: UsageEvent): Promise<void>;
  /** Aggregate the window at the store (never by paging rows into a caller — the ADR-0053 rule). */
  summarize(query: UsageQuery): Promise<readonly UsageAggregate[]>;
  /** The same aggregate split per UTC day, ascending — the analytics time series. */
  daily(query: UsageQuery): Promise<readonly UsageDailyAggregate[]>;
  /**
   * The earliest day the store actually holds for the scope, or `null` when it holds nothing.
   *
   * This is what keeps a window honest: a caller asking for 90 days of a 3-day-old deployment must be
   * told the real floor, or the view draws 87 days of zeros and claims nothing happened (ADR-0053 clause 3).
   */
  earliestDay(scope: UsageScope): Promise<UsageDay | null>;
}
