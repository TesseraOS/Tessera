import type { UsageAggregate, UsageOperation } from '../ports.js';

/**
 * The raw shape a `SUM`/`GROUP BY` projection comes back as, before it is trusted.
 *
 * Every field is `unknown` on purpose: **node-postgres returns `sum()` and `count()` as strings**
 * (bigint, to avoid truncating past 2^53), while better-sqlite3 returns numbers. A driver-shaped
 * difference must not reach the port.
 */
export interface UsageAggregateRow {
  readonly operation: UsageOperation;
  readonly count: unknown;
  readonly tokens: unknown;
  readonly sumDurationMs: unknown;
  readonly maxDurationMs: unknown;
  readonly sumBudgetAdherence: unknown;
  readonly sumProvenanceCoverage: unknown;
  readonly scoredCount: unknown;
}

/**
 * Normalize a driver row into the port's {@link UsageAggregate}.
 *
 * Shared by the SQLite and Postgres adapters so the parse cannot be present in one and forgotten in
 * the other. A stray `'2'` satisfies loose equality and reveals itself only once it flows into
 * arithmetic as `'21'`. `?? 0` covers an aggregate over zero rows, where SQL returns `NULL`.
 *
 * **Which fields actually need it, measured rather than assumed:** node-postgres returns `sum()` over
 * an *integer* column as a string (bigint), but `sum()`/`max()` over `double precision` as a number.
 * So `count`, `tokens` and `scoredCount` genuinely require the parse; on the four float8 fields it is a
 * no-op — kept deliberately, because it costs nothing and it is what survives a driver upgrade or a
 * `pg-types` parser change that starts handing floats back as text.
 */
export function toUsageAggregate(row: UsageAggregateRow): UsageAggregate {
  return {
    operation: row.operation,
    count: Number(row.count ?? 0),
    tokens: Number(row.tokens ?? 0),
    sumDurationMs: Number(row.sumDurationMs ?? 0),
    maxDurationMs: Number(row.maxDurationMs ?? 0),
    sumBudgetAdherence: Number(row.sumBudgetAdherence ?? 0),
    sumProvenanceCoverage: Number(row.sumProvenanceCoverage ?? 0),
    scoredCount: Number(row.scoredCount ?? 0),
  };
}
