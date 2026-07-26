import { DEFAULT_TENANT_ID, newId, type TenantId } from '@tessera/core';
import { ACTIVITY_ACTIONS, DEFAULT_AUDIT_PAGE_SIZE, MAX_AUDIT_PAGE_SIZE } from '@tessera/api';
import type {
  ActivityResult,
  AuditAction,
  AuditEvent,
  AuditLog,
  AuditMetadata,
  AuditOutcome,
  AuditQuery,
} from '@tessera/api';
import { and, desc, eq, gte, inArray, lt, lte, sql, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { bigserial, jsonb, pgTable, text } from 'drizzle-orm/pg-core';

/**
 * Drizzle schema for the Postgres `audit_events` table — the same columns the SQLite adapter defines.
 *
 * `seq` is `bigserial` in **number** mode, standing in for SQLite's `INTEGER PRIMARY KEY
 * AUTOINCREMENT`, so the cursor is a JS number on both adapters. Raw node-postgres returns `bigint`
 * as a *string*, and a string `seq` would break the cursor comparison silently rather than loudly —
 * `'9' < '10'` is `false`. (Drizzle's typed column maps it either way, so this is belt-and-braces
 * rather than the only thing standing between us and that bug.)
 */
const auditEvents = pgTable('audit_events', {
  seq: bigserial('seq', { mode: 'number' }).primaryKey(),
  id: text('id').notNull(),
  tenantId: text('tenant_id').$type<TenantId>().notNull(),
  actorPrincipalId: text('actor_principal_id').notNull(),
  actorKind: text('actor_kind').$type<AuditEvent['actor']['kind']>().notNull(),
  action: text('action').$type<AuditAction>().notNull(),
  target: text('target'),
  outcome: text('outcome').$type<AuditOutcome>().notNull(),
  at: text('at').notNull(),
  metadata: jsonb('metadata').$type<AuditMetadata>(),
});

/** Schema for the Postgres {@link AuditLog} (F-056, ADR-0059 §2). */
export const pgAuditLogMigrations: readonly { id: string; up: readonly string[] }[] = [
  {
    id: 'f056-audit-events-001',
    up: [
      `CREATE TABLE IF NOT EXISTS audit_events (
        seq bigserial PRIMARY KEY,
        id text NOT NULL,
        tenant_id text NOT NULL,
        actor_principal_id text NOT NULL,
        actor_kind text NOT NULL,
        action text NOT NULL,
        target text,
        outcome text NOT NULL,
        at text NOT NULL,
        metadata jsonb
      )`,
      `CREATE INDEX IF NOT EXISTS idx_audit_tenant_seq ON audit_events (tenant_id, seq)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_tenant_action ON audit_events (tenant_id, action)`,
    ],
  },
];

type AuditRow = typeof auditEvents.$inferSelect;

function toEvent(row: AuditRow): AuditEvent {
  return {
    id: row.id,
    tenantId: row.tenantId,
    actor: { principalId: row.actorPrincipalId, kind: row.actorKind },
    action: row.action,
    ...(row.target !== null ? { target: row.target } : {}),
    outcome: row.outcome,
    at: row.at,
    ...(row.metadata !== null ? { metadata: row.metadata } : {}),
  };
}

/**
 * Postgres {@link AuditLog} (ADR-0034) — the compliance trail, durable and shared across replicas.
 *
 * A monotonic `seq` gives newest-first ordering and a stable pagination cursor (`seq < cursor`);
 * every row carries a `tenant_id` and {@link AuditLog.forTenant} scopes reads and writes to one
 * tenant (FR-52, ADR-0033). Retention (`prune`, NFR-13) deletes by max age and/or caps to the newest
 * `maxEntries`.
 *
 * **Tables must already exist** ({@link pgAuditLogMigrations}).
 */
export function createPostgresAuditLog(db: NodePgDatabase): AuditLog {
  function storeFor(tenantId: TenantId): AuditLog {
    const inTenant = eq(auditEvents.tenantId, tenantId);
    return {
      async record(input) {
        await db.insert(auditEvents).values({
          id: newId<'Audit'>(),
          tenantId, // stamp the bound tenant regardless of the input's tenantId
          actorPrincipalId: input.actor.principalId,
          actorKind: input.actor.kind,
          action: input.action,
          target: input.target ?? null,
          outcome: input.outcome,
          at: input.at ?? new Date().toISOString(),
          metadata: input.metadata ?? null,
        });
      },

      async query(query = {}) {
        const limit = Math.min(query.limit ?? DEFAULT_AUDIT_PAGE_SIZE, MAX_AUDIT_PAGE_SIZE);
        const conditions: SQL[] = [inTenant];
        if (query.action !== undefined) conditions.push(eq(auditEvents.action, query.action));
        if (query.actions !== undefined) {
          conditions.push(inArray(auditEvents.action, query.actions as AuditAction[]));
        }
        if (query.actor !== undefined) {
          conditions.push(eq(auditEvents.actorPrincipalId, query.actor));
        }
        if (query.outcome !== undefined) conditions.push(eq(auditEvents.outcome, query.outcome));
        if (query.since !== undefined) conditions.push(gte(auditEvents.at, query.since));
        if (query.until !== undefined) conditions.push(lte(auditEvents.at, query.until));
        if (query.cursor !== undefined) conditions.push(lt(auditEvents.seq, Number(query.cursor)));

        // Fetch one extra to learn whether a next page exists without a second count query.
        const rows = await db
          .select()
          .from(auditEvents)
          .where(and(...conditions))
          .orderBy(desc(auditEvents.seq))
          .limit(limit + 1);

        const hasMore = rows.length > limit;
        const pageRows = hasMore ? rows.slice(0, limit) : rows;
        const lastRow = pageRows[pageRows.length - 1];
        return hasMore && lastRow !== undefined
          ? { events: pageRows.map(toEvent), nextCursor: String(lastRow.seq) }
          : { events: pageRows.map(toEvent) };
      },

      async activity(query) {
        const actions = query.actions ?? ACTIVITY_ACTIONS;
        // GROUP BY the viewer's calendar day, at the store, counting only "work" actions in the
        // window. SQLite spells this `date(at, '<n> minutes')`; Postgres has no such function, so the
        // ISO text is cast to `timestamptz`, shifted by the offset, rendered back in UTC, and
        // formatted. Offset 0 therefore reproduces exactly the UTC day SQLite returns — which is the
        // property that keeps the two adapters' charts identical (F-088).
        const minutes = query.tzOffsetMinutes ?? 0;
        const localDay = sql<string>`to_char(
          ((${auditEvents.at}::timestamptz + make_interval(mins => ${minutes})) AT TIME ZONE 'UTC'),
          'YYYY-MM-DD'
        )`;

        const rows = await db
          .select({ date: localDay, count: sql<number>`count(*)` })
          .from(auditEvents)
          .where(
            and(
              inTenant,
              inArray(auditEvents.action, actions as AuditAction[]),
              gte(auditEvents.at, query.since),
              lte(auditEvents.at, query.until),
            ),
          )
          // GROUP BY / ORDER BY the **ordinal**, not the expression. Postgres rejects the repeated
          // expression Drizzle inlines here ("column audit_events.at must appear in the GROUP BY
          // clause") because the two renderings do not match as equal expressions. `1` refers to the
          // first selected column, which is exactly the day bucket.
          .groupBy(sql`1`)
          .orderBy(sql`1`);

        // The retention floor — MIN(at) over the WHOLE tenant trail (any action), so a chart never
        // draws a pruned day as silence (ADR-0053 clause 3). `null` for an empty trail.
        const floorRows = await db
          .select({ earliest: sql<string | null>`min(${auditEvents.at})` })
          .from(auditEvents)
          .where(inTenant);

        const result: ActivityResult = {
          buckets: rows.map((row) => ({ date: row.date, count: Number(row.count) })),
          earliest: floorRows[0]?.earliest ?? null,
        };
        return result;
      },

      async prune(policy) {
        let pruned = 0;
        if (policy.maxAgeMs !== undefined) {
          const cutoff = new Date(Date.now() - policy.maxAgeMs).toISOString();
          const result = await db.execute(
            sql`DELETE FROM audit_events WHERE tenant_id = ${tenantId} AND at < ${cutoff}`,
          );
          pruned += result.rowCount ?? 0;
        }
        if (policy.maxEntries !== undefined) {
          const result = await db.execute(
            sql`DELETE FROM audit_events WHERE tenant_id = ${tenantId} AND seq NOT IN (
              SELECT seq FROM audit_events WHERE tenant_id = ${tenantId}
              ORDER BY seq DESC LIMIT ${policy.maxEntries}
            )`,
          );
          pruned += result.rowCount ?? 0;
        }
        return pruned;
      },

      forTenant(next) {
        return storeFor(next);
      },
    };
  }

  return storeFor(DEFAULT_TENANT_ID);
}

// Re-export the query type so callers building filters have it locally.
export type { AuditQuery };
