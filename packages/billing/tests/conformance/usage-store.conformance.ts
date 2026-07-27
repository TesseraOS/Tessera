import { describe, expect, it } from 'vitest';
import type { UsageAggregate, UsageEvent, UsageOperation, UsageStore } from '../../src/usage/ports';

export interface UsageStoreHarness {
  store: UsageStore;
  cleanup?: () => Promise<void>;
}

/** Builds a fresh, isolated UsageStore for each test. */
export type UsageStoreFactory = () => Promise<UsageStoreHarness>;

/**
 * A metered occurrence with sensible defaults; override any field.
 *
 * Deliberately NOT uniquified per call (unlike the MemoryStore suite's `memory()`): a usage event has
 * no identity, and two identical events must land in the same bucket and add — that is the contract.
 */
function usageEvent(overrides: Partial<UsageEvent> = {}): UsageEvent {
  return {
    tenantId: 'tenant-a',
    projectId: 'project-a',
    operation: 'compile',
    occurredAt: '2026-05-04T10:00:00.000Z',
    durationMs: 120,
    ...overrides,
  };
}

function aggregateFor(
  aggregates: readonly UsageAggregate[],
  operation: UsageOperation,
): UsageAggregate | undefined {
  return aggregates.find((aggregate) => aggregate.operation === operation);
}

const MAY = { from: '2026-05-01', until: '2026-05-31' } as const;

/**
 * The behavioral contract every {@link UsageStore} adapter must satisfy (ADR-0003, ADR-0014, ADR-0060).
 *
 * Run **unmodified** by the in-memory, SQLite, and Postgres adapters. If a suite has to change to
 * accommodate an adapter, that is a finding, not a task — a contract only the reference adapter honours
 * is not a contract, which is what F-078 records about the audit log.
 */
export function runUsageStoreConformance(name: string, makeStore: UsageStoreFactory): void {
  describe(`UsageStore conformance: ${name}`, () => {
    it('records an occurrence and aggregates it back', async () => {
      const { store, cleanup } = await makeStore();
      try {
        await store.record(usageEvent({ durationMs: 250, tokens: 4096 }));

        const summary = await store.summarize({ tenantId: 'tenant-a', ...MAY });
        expect(summary).toHaveLength(1);
        expect(summary[0]).toMatchObject({
          operation: 'compile',
          count: 1,
          tokens: 4096,
          sumDurationMs: 250,
          maxDurationMs: 250,
        });
      } finally {
        await cleanup?.();
      }
    });

    it('accumulates repeated occurrences into one bucket — counts add, durations sum, the max is the max', async () => {
      // Mutation check: `count = Math.max(count, 1)` (or an INSERT that replaces rather than adds)
      // turns this red. So does summing into `maxDurationMs`, or maxing into `sumDurationMs`.
      const { store, cleanup } = await makeStore();
      try {
        await store.record(usageEvent({ durationMs: 100, tokens: 1000 }));
        await store.record(usageEvent({ durationMs: 900, tokens: 500 }));
        await store.record(usageEvent({ durationMs: 300, tokens: 500 }));

        const summary = await store.summarize({ tenantId: 'tenant-a', ...MAY });
        expect(summary).toHaveLength(1);
        expect(summary[0]).toMatchObject({
          count: 3,
          tokens: 2000,
          sumDurationMs: 1300,
          maxDurationMs: 900,
        });
      } finally {
        await cleanup?.();
      }
    });

    it('returns numbers, not strings — a driver that hands back bigint counts as text must be parsed', async () => {
      // node-postgres returns `count(*)`/`sum()` as strings (bigint, to avoid truncating past 2^53).
      // A stray '2' satisfies loose equality and then flows into arithmetic as '21' — so assert the TYPE.
      // Mutation check: dropping the Number(...) parse in the Postgres adapter leaves every other
      // assertion in this suite green and turns only this one red. That is the point of it.
      const { store, cleanup } = await makeStore();
      try {
        await store.record(usageEvent({ tokens: 10, durationMs: 5, budgetAdherence: 0.5 }));
        await store.record(usageEvent({ tokens: 10, durationMs: 5 }));

        const [summary] = await store.summarize({ tenantId: 'tenant-a', ...MAY });
        expect(summary).toBeDefined();
        for (const field of [
          'count',
          'tokens',
          'sumDurationMs',
          'maxDurationMs',
          'sumBudgetAdherence',
          'sumProvenanceCoverage',
          'scoredCount',
        ] as const) {
          expect(typeof summary?.[field], `${field} must be a number`).toBe('number');
        }
      } finally {
        await cleanup?.();
      }
    });

    it('never leaks across tenants', async () => {
      // Mutation check: dropping tenant_id from the bucket key (or the WHERE clause) turns this red.
      const { store, cleanup } = await makeStore();
      try {
        await store.record(usageEvent({ tenantId: 'tenant-a', tokens: 100 }));
        await store.record(usageEvent({ tenantId: 'tenant-b', tokens: 999 }));

        const a = await store.summarize({ tenantId: 'tenant-a', ...MAY });
        const b = await store.summarize({ tenantId: 'tenant-b', ...MAY });
        expect(aggregateFor(a, 'compile')).toMatchObject({ count: 1, tokens: 100 });
        expect(aggregateFor(b, 'compile')).toMatchObject({ count: 1, tokens: 999 });
      } finally {
        await cleanup?.();
      }
    });

    it('scopes to a project when asked, and sums across every project when not', async () => {
      // The asymmetry is load-bearing: analytics scopes to a project like every other view, while the
      // monthly entitlement sums across them, because a subscription is per-TENANT (ADR-0060 §4).
      const { store, cleanup } = await makeStore();
      try {
        await store.record(usageEvent({ projectId: 'project-a', tokens: 10 }));
        await store.record(usageEvent({ projectId: 'project-b', tokens: 20 }));

        const scoped = await store.summarize({
          tenantId: 'tenant-a',
          projectId: 'project-a',
          ...MAY,
        });
        const tenantWide = await store.summarize({ tenantId: 'tenant-a', ...MAY });
        expect(aggregateFor(scoped, 'compile')).toMatchObject({ count: 1, tokens: 10 });
        expect(aggregateFor(tenantWide, 'compile')).toMatchObject({ count: 2, tokens: 30 });
      } finally {
        await cleanup?.();
      }
    });

    it('treats the window as inclusive on both ends', async () => {
      // Mutation check: `day > from` instead of `>=` (or `<` instead of `<=` on until) turns this red.
      // An exclusive bound silently under-reports the newest day, which is the one a dashboard opens on.
      const { store, cleanup } = await makeStore();
      try {
        await store.record(usageEvent({ occurredAt: '2026-05-09T12:00:00.000Z' }));
        await store.record(usageEvent({ occurredAt: '2026-05-10T12:00:00.000Z' }));
        await store.record(usageEvent({ occurredAt: '2026-05-11T12:00:00.000Z' }));
        await store.record(usageEvent({ occurredAt: '2026-05-12T12:00:00.000Z' }));

        const inner = await store.summarize({
          tenantId: 'tenant-a',
          from: '2026-05-10',
          until: '2026-05-11',
        });
        expect(aggregateFor(inner, 'compile')?.count).toBe(2);

        const oneDay = await store.summarize({
          tenantId: 'tenant-a',
          from: '2026-05-10',
          until: '2026-05-10',
        });
        expect(aggregateFor(oneDay, 'compile')?.count).toBe(1);
      } finally {
        await cleanup?.();
      }
    });

    it('separates operations, and filters to the ones asked for', async () => {
      const { store, cleanup } = await makeStore();
      try {
        await store.record(usageEvent({ operation: 'compile' }));
        await store.record(usageEvent({ operation: 'search' }));
        await store.record(usageEvent({ operation: 'search' }));
        await store.record(usageEvent({ operation: 'ingest' }));
        await store.record(usageEvent({ operation: 'memory.write' }));

        const all = await store.summarize({ tenantId: 'tenant-a', ...MAY });
        expect(all).toHaveLength(4);
        expect(aggregateFor(all, 'search')?.count).toBe(2);

        const compilesOnly = await store.summarize({
          tenantId: 'tenant-a',
          ...MAY,
          operations: ['compile'],
        });
        expect(compilesOnly).toHaveLength(1);
        expect(compilesOnly[0]?.count).toBe(1);
      } finally {
        await cleanup?.();
      }
    });

    it('buckets by UTC day, not by the host timezone', async () => {
      // 23:30Z is the NEXT day east of UTC (+05:30 here); 02:00Z is the PREVIOUS day west of it. A
      // calendar-getter implementation therefore merges these two into one bucket on any machine that
      // is not exactly UTC. Stated honestly: on a UTC host this assertion degrades to a tautology, so
      // it catches the mutation on developer machines and in any non-UTC CI, not universally.
      const { store, cleanup } = await makeStore();
      try {
        await store.record(usageEvent({ occurredAt: '2026-05-01T23:30:00.000Z' }));
        await store.record(usageEvent({ occurredAt: '2026-05-02T02:00:00.000Z' }));

        const days = await store.daily({ tenantId: 'tenant-a', ...MAY });
        expect(days.map((day) => day.day)).toEqual(['2026-05-01', '2026-05-02']);
        expect(days.every((day) => day.count === 1)).toBe(true);
      } finally {
        await cleanup?.();
      }
    });

    it('splits the daily series per day and operation, ascending', async () => {
      const { store, cleanup } = await makeStore();
      try {
        await store.record(usageEvent({ occurredAt: '2026-05-03T09:00:00.000Z' }));
        await store.record(usageEvent({ occurredAt: '2026-05-01T09:00:00.000Z' }));
        await store.record(usageEvent({ occurredAt: '2026-05-01T21:00:00.000Z' }));
        await store.record(
          usageEvent({ occurredAt: '2026-05-01T21:00:00.000Z', operation: 'search' }),
        );

        const days = await store.daily({ tenantId: 'tenant-a', ...MAY });
        expect(days.map((day) => [day.day, day.operation, day.count])).toEqual([
          ['2026-05-01', 'compile', 2],
          ['2026-05-01', 'search', 1],
          ['2026-05-03', 'compile', 1],
        ]);
      } finally {
        await cleanup?.();
      }
    });

    it('counts only scored occurrences toward the quality divisor', async () => {
      // scoredCount is the divisor for the FR-47 quality averages. Using `count` instead would deflate
      // every average by the searches and ingests that never carry a PackageScores at all.
      // Mutation check: incrementing scoredCount unconditionally turns this red.
      const { store, cleanup } = await makeStore();
      try {
        await store.record(usageEvent({ budgetAdherence: 0.8, provenanceCoverage: 1 }));
        await store.record(usageEvent({ budgetAdherence: 0.6, provenanceCoverage: 0.5 }));
        await store.record(usageEvent({ operation: 'search' }));

        const summary = await store.summarize({ tenantId: 'tenant-a', ...MAY });
        const compile = aggregateFor(summary, 'compile');
        expect(compile?.scoredCount).toBe(2);
        expect(compile?.sumBudgetAdherence).toBeCloseTo(1.4, 6);
        expect(compile?.sumProvenanceCoverage).toBeCloseTo(1.5, 6);
        expect(aggregateFor(summary, 'search')?.scoredCount).toBe(0);
      } finally {
        await cleanup?.();
      }
    });

    it('reports the earliest day it actually holds, per scope, and null when it holds nothing', async () => {
      // This is what keeps a window honest (ADR-0053 clause 3): a caller asking for 90 days of a
      // 3-day-old deployment must be told the real floor, or the chart draws 87 days of zeros.
      const { store, cleanup } = await makeStore();
      try {
        expect(await store.earliestDay({ tenantId: 'tenant-a' })).toBeNull();

        await store.record(usageEvent({ occurredAt: '2026-05-08T00:00:00.000Z' }));
        await store.record(usageEvent({ occurredAt: '2026-05-02T00:00:00.000Z' }));
        await store.record(
          usageEvent({ occurredAt: '2026-04-30T00:00:00.000Z', projectId: 'project-b' }),
        );
        await store.record(
          usageEvent({ occurredAt: '2026-01-01T00:00:00.000Z', tenantId: 'tenant-b' }),
        );

        expect(await store.earliestDay({ tenantId: 'tenant-a' })).toBe('2026-04-30');
        expect(await store.earliestDay({ tenantId: 'tenant-a', projectId: 'project-a' })).toBe(
          '2026-05-02',
        );
        expect(await store.earliestDay({ tenantId: 'tenant-b' })).toBe('2026-01-01');
      } finally {
        await cleanup?.();
      }
    });

    it('returns nothing for a window it holds no rows in', async () => {
      // A zero-row window must come back EMPTY, not as zero-valued aggregates: the caller decides how to
      // render "no data", and a fabricated `{count: 0, sumBudgetAdherence: 0}` would let a quality
      // average of 0 be computed for a period in which nothing was ever compiled.
      const { store, cleanup } = await makeStore();
      try {
        await store.record(usageEvent({ occurredAt: '2026-05-04T10:00:00.000Z' }));

        expect(
          await store.summarize({ tenantId: 'tenant-a', from: '2026-06-01', until: '2026-06-30' }),
        ).toEqual([]);
        expect(
          await store.daily({ tenantId: 'tenant-a', from: '2026-06-01', until: '2026-06-30' }),
        ).toEqual([]);
      } finally {
        await cleanup?.();
      }
    });
  });
}
