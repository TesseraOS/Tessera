import { and, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import {
  DEFAULT_PROJECT_ID,
  DEFAULT_TENANT_ID,
  type ProjectId,
  type TenantId,
} from '@tessera/core';
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
import { toUsageAggregate } from './aggregate-row.js';

/**
 * Drizzle schema for the SQLite `usage_buckets` table (ADR-0060 §4). One row per
 * `(tenant, project, UTC day, operation)` — pre-aggregated at write time, so the read path is a
 * `SUM`/`GROUP BY` over a handful of rows rather than a scan of every request ever served.
 *
 * `real` is SQLite's float8, matching the `double precision` the Postgres twin uses — the two adapters
 * must not disagree about a stored duration (the F-056 `confidence` lesson).
 */
const usageBuckets = sqliteTable(
  'usage_buckets',
  {
    tenantId: text('tenant_id').$type<TenantId>().notNull().default(DEFAULT_TENANT_ID),
    projectId: text('project_id').$type<ProjectId>().notNull().default(DEFAULT_PROJECT_ID),
    day: text('day').notNull(),
    operation: text('operation').$type<UsageOperation>().notNull(),
    count: integer('count').notNull().default(0),
    tokens: integer('tokens').notNull().default(0),
    sumDurationMs: real('sum_duration_ms').notNull().default(0),
    maxDurationMs: real('max_duration_ms').notNull().default(0),
    sumBudgetAdherence: real('sum_budget_adherence').notNull().default(0),
    sumProvenanceCoverage: real('sum_provenance_coverage').notNull().default(0),
    scoredCount: integer('scored_count').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.day, table.operation] }),
  ],
);

const CREATE_TABLE = sql`
  CREATE TABLE IF NOT EXISTS usage_buckets (
    tenant_id TEXT NOT NULL DEFAULT '${sql.raw(DEFAULT_TENANT_ID)}',
    project_id TEXT NOT NULL DEFAULT '${sql.raw(DEFAULT_PROJECT_ID)}',
    day TEXT NOT NULL,
    operation TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    tokens INTEGER NOT NULL DEFAULT 0,
    sum_duration_ms REAL NOT NULL DEFAULT 0,
    max_duration_ms REAL NOT NULL DEFAULT 0,
    sum_budget_adherence REAL NOT NULL DEFAULT 0,
    sum_provenance_coverage REAL NOT NULL DEFAULT 0,
    scored_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, project_id, day, operation)
  )
`;

/** SQLite {@link UsageStore} (the Local profile's store — ADR-0060 §7). Self-provisions its table. */
export function createSqliteUsageStore(db: BetterSQLite3Database): UsageStore {
  db.run(CREATE_TABLE);

  const conditions = (query: UsageQuery): SQL | undefined => {
    assertUsageDay(query.from);
    assertUsageDay(query.until);
    const parts = [
      eq(usageBuckets.tenantId, query.tenantId),
      gte(usageBuckets.day, query.from),
      lte(usageBuckets.day, query.until),
    ];
    if (query.projectId !== undefined) {
      parts.push(eq(usageBuckets.projectId, query.projectId));
    }
    if (query.operations !== undefined) {
      parts.push(inArray(usageBuckets.operation, [...query.operations]));
    }
    return and(...parts);
  };

  const projection = {
    count: sql<number>`sum(${usageBuckets.count})`,
    tokens: sql<number>`sum(${usageBuckets.tokens})`,
    sumDurationMs: sql<number>`sum(${usageBuckets.sumDurationMs})`,
    maxDurationMs: sql<number>`max(${usageBuckets.maxDurationMs})`,
    sumBudgetAdherence: sql<number>`sum(${usageBuckets.sumBudgetAdherence})`,
    sumProvenanceCoverage: sql<number>`sum(${usageBuckets.sumProvenanceCoverage})`,
    scoredCount: sql<number>`sum(${usageBuckets.scoredCount})`,
  };

  return {
    record(event: UsageEvent): Promise<void> {
      const day = usageDay(event.occurredAt);
      const tokens = event.tokens ?? 0;
      const scored = event.budgetAdherence !== undefined || event.provenanceCoverage !== undefined;
      const budgetAdherence = event.budgetAdherence ?? 0;
      const provenanceCoverage = event.provenanceCoverage ?? 0;
      const scoredCount = scored ? 1 : 0;

      db.insert(usageBuckets)
        .values({
          tenantId: event.tenantId,
          projectId: event.projectId,
          day,
          operation: event.operation,
          count: 1,
          tokens,
          sumDurationMs: event.durationMs,
          maxDurationMs: event.durationMs,
          sumBudgetAdherence: scored ? budgetAdherence : 0,
          sumProvenanceCoverage: scored ? provenanceCoverage : 0,
          scoredCount,
        })
        // Accumulate, never replace: two compiles on one day are `count: 2`, not `count: 1`.
        .onConflictDoUpdate({
          target: [
            usageBuckets.tenantId,
            usageBuckets.projectId,
            usageBuckets.day,
            usageBuckets.operation,
          ],
          set: {
            count: sql`${usageBuckets.count} + 1`,
            tokens: sql`${usageBuckets.tokens} + ${tokens}`,
            sumDurationMs: sql`${usageBuckets.sumDurationMs} + ${event.durationMs}`,
            // SQLite's two-argument `max()` is the scalar one (Postgres spells it `greatest`).
            maxDurationMs: sql`max(${usageBuckets.maxDurationMs}, ${event.durationMs})`,
            sumBudgetAdherence: scored
              ? sql`${usageBuckets.sumBudgetAdherence} + ${budgetAdherence}`
              : usageBuckets.sumBudgetAdherence,
            sumProvenanceCoverage: scored
              ? sql`${usageBuckets.sumProvenanceCoverage} + ${provenanceCoverage}`
              : usageBuckets.sumProvenanceCoverage,
            scoredCount: sql`${usageBuckets.scoredCount} + ${scoredCount}`,
          },
        })
        .run();
      return Promise.resolve();
    },

    summarize(query: UsageQuery): Promise<readonly UsageAggregate[]> {
      if (query.operations?.length === 0) return Promise.resolve([]);
      const rows = db
        .select({ operation: usageBuckets.operation, ...projection })
        .from(usageBuckets)
        .where(conditions(query))
        .groupBy(usageBuckets.operation)
        .all();
      return Promise.resolve(rows.map(toUsageAggregate));
    },

    daily(query: UsageQuery): Promise<readonly UsageDailyAggregate[]> {
      if (query.operations?.length === 0) return Promise.resolve([]);
      const rows = db
        .select({ day: usageBuckets.day, operation: usageBuckets.operation, ...projection })
        .from(usageBuckets)
        .where(conditions(query))
        .groupBy(usageBuckets.day, usageBuckets.operation)
        .orderBy(usageBuckets.day, usageBuckets.operation)
        .all();
      return Promise.resolve(rows.map((row) => ({ ...toUsageAggregate(row), day: row.day })));
    },

    earliestDay(scope: UsageScope): Promise<UsageDay | null> {
      const parts = [eq(usageBuckets.tenantId, scope.tenantId)];
      if (scope.projectId !== undefined) {
        parts.push(eq(usageBuckets.projectId, scope.projectId));
      }
      const row = db
        .select({ day: sql<string | null>`min(${usageBuckets.day})` })
        .from(usageBuckets)
        .where(and(...parts))
        .get();
      return Promise.resolve(row?.day ?? null);
    },
  };
}
