import { and, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { doublePrecision, integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
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
 * Drizzle schema for the Postgres `usage_buckets` table — the same columns the SQLite adapter defines,
 * so one bucket shape serves both.
 *
 * `doublePrecision`, not `real`: PG `real` is float4 (~7 significant digits) while SQLite's `REAL` is
 * float8. A summed duration crosses 7 digits after about three hours of accumulated compile time, and
 * two adapters disagreeing about a stored number is exactly what the shared conformance suite exists
 * to prevent (the F-056 `confidence` lesson).
 */
const usageBuckets = pgTable(
  'usage_buckets',
  {
    tenantId: text('tenant_id').$type<TenantId>().notNull().default(DEFAULT_TENANT_ID),
    projectId: text('project_id').$type<ProjectId>().notNull().default(DEFAULT_PROJECT_ID),
    day: text('day').notNull(),
    operation: text('operation').$type<UsageOperation>().notNull(),
    count: integer('count').notNull().default(0),
    tokens: integer('tokens').notNull().default(0),
    sumDurationMs: doublePrecision('sum_duration_ms').notNull().default(0),
    maxDurationMs: doublePrecision('max_duration_ms').notNull().default(0),
    sumBudgetAdherence: doublePrecision('sum_budget_adherence').notNull().default(0),
    sumProvenanceCoverage: doublePrecision('sum_provenance_coverage').notNull().default(0),
    scoredCount: integer('scored_count').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.day, table.operation] }),
  ],
);

/**
 * Schema for the Postgres UsageStore (ADR-0059 §2, ADR-0060 §4).
 *
 * The adapter does **not** create these itself — unlike the SQLite adapter, which self-provisions on
 * construction. The composition root applies every package's migrations once, under an advisory lock,
 * because a self-provisioning adapter in a multi-replica deployment means concurrent DDL on boot. The
 * package that owns the schema still owns its DDL; it just does not run it.
 */
export const pgUsageMigrations: readonly { id: string; up: readonly string[] }[] = [
  {
    id: 'f057-usage-001',
    up: [
      `CREATE TABLE IF NOT EXISTS usage_buckets (
        tenant_id text NOT NULL DEFAULT '${DEFAULT_TENANT_ID}',
        project_id text NOT NULL DEFAULT '${DEFAULT_PROJECT_ID}',
        day text NOT NULL,
        operation text NOT NULL,
        count integer NOT NULL DEFAULT 0,
        tokens integer NOT NULL DEFAULT 0,
        sum_duration_ms double precision NOT NULL DEFAULT 0,
        max_duration_ms double precision NOT NULL DEFAULT 0,
        sum_budget_adherence double precision NOT NULL DEFAULT 0,
        sum_provenance_coverage double precision NOT NULL DEFAULT 0,
        scored_count integer NOT NULL DEFAULT 0,
        PRIMARY KEY (tenant_id, project_id, day, operation)
      )`,
      // Every read is "this tenant, this window" — the PK's leading columns already serve it, but the
      // monthly entitlement scans ACROSS projects, where the PK's second column stops helping.
      `CREATE INDEX IF NOT EXISTS idx_usage_buckets_window
         ON usage_buckets (tenant_id, day, operation)`,
    ],
  },
];

/** Postgres {@link UsageStore} (the self-hosted + cloud profile's store — ADR-0060 §7). */
export function createPostgresUsageStore(db: NodePgDatabase): UsageStore {
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
    async record(event: UsageEvent): Promise<void> {
      const day = usageDay(event.occurredAt);
      const tokens = event.tokens ?? 0;
      const scored = event.budgetAdherence !== undefined || event.provenanceCoverage !== undefined;
      const budgetAdherence = event.budgetAdherence ?? 0;
      const provenanceCoverage = event.provenanceCoverage ?? 0;

      await db
        .insert(usageBuckets)
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
          scoredCount: scored ? 1 : 0,
        })
        // Accumulate, never replace — and this is also what makes concurrent recorders safe: the
        // increment happens inside the database, not read-modify-write in a replica.
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
            // Postgres spells the scalar two-argument maximum `greatest` (SQLite calls it `max`).
            maxDurationMs: sql`greatest(${usageBuckets.maxDurationMs}, ${event.durationMs})`,
            sumBudgetAdherence: scored
              ? sql`${usageBuckets.sumBudgetAdherence} + ${budgetAdherence}`
              : usageBuckets.sumBudgetAdherence,
            sumProvenanceCoverage: scored
              ? sql`${usageBuckets.sumProvenanceCoverage} + ${provenanceCoverage}`
              : usageBuckets.sumProvenanceCoverage,
            scoredCount: sql`${usageBuckets.scoredCount} + ${scored ? 1 : 0}`,
          },
        });
    },

    async summarize(query: UsageQuery): Promise<readonly UsageAggregate[]> {
      if (query.operations?.length === 0) return [];
      const rows = await db
        .select({ operation: usageBuckets.operation, ...projection })
        .from(usageBuckets)
        .where(conditions(query))
        .groupBy(usageBuckets.operation);
      return rows.map(toUsageAggregate);
    },

    async daily(query: UsageQuery): Promise<readonly UsageDailyAggregate[]> {
      if (query.operations?.length === 0) return [];
      const rows = await db
        .select({ day: usageBuckets.day, operation: usageBuckets.operation, ...projection })
        .from(usageBuckets)
        .where(conditions(query))
        .groupBy(usageBuckets.day, usageBuckets.operation)
        .orderBy(usageBuckets.day, usageBuckets.operation);
      return rows.map((row) => ({ ...toUsageAggregate(row), day: row.day }));
    },

    async earliestDay(scope: UsageScope): Promise<UsageDay | null> {
      const parts = [eq(usageBuckets.tenantId, scope.tenantId)];
      if (scope.projectId !== undefined) {
        parts.push(eq(usageBuckets.projectId, scope.projectId));
      }
      const rows = await db
        .select({ day: sql<string | null>`min(${usageBuckets.day})` })
        .from(usageBuckets)
        .where(and(...parts));
      return rows[0]?.day ?? null;
    },
  };
}
