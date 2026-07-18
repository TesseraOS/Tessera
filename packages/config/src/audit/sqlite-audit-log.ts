import { DEFAULT_TENANT_ID, newId, type TenantId } from '@tessera/core';
import { ACTIVITY_ACTIONS, DEFAULT_AUDIT_PAGE_SIZE, MAX_AUDIT_PAGE_SIZE } from '@tessera/api';
import type {
  ActivityResult,
  AuditAction,
  AuditEvent,
  AuditLog,
  AuditMetadata,
  AuditOutcome,
  AuditPage,
  AuditQuery,
} from '@tessera/api';
import { and, desc, eq, gte, inArray, lte, lt, sql, type SQL } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Persistent {@link AuditLog} over the storage `SqliteStore`'s Drizzle handle (ADR-0034) — so the audit
 * trail **survives restarts** (the in-memory adapter in `@tessera/api` does not). Type-only import of the
 * audit contract keeps `@tessera/config` (and the MCP process booting through it) Fastify-free (ADR-0030),
 * mirroring `createSqliteTokenStore`.
 *
 * A monotonic `seq` (rowid) gives newest-first ordering and a **stable pagination cursor** (`seq < cursor`);
 * every row carries a `tenant_id` and {@link AuditLog.forTenant} scopes reads/writes to one tenant (FR-52,
 * ADR-0033). Retention (`prune`, NFR-13) deletes by max age and/or caps to the newest `maxEntries`.
 */
const auditEvents = sqliteTable('audit_events', {
  seq: integer('seq').primaryKey({ autoIncrement: true }),
  id: text('id').notNull(),
  tenantId: text('tenant_id').$type<TenantId>().notNull(),
  actorPrincipalId: text('actor_principal_id').notNull(),
  actorKind: text('actor_kind').$type<AuditEvent['actor']['kind']>().notNull(),
  action: text('action').$type<AuditAction>().notNull(),
  target: text('target'),
  outcome: text('outcome').$type<AuditOutcome>().notNull(),
  at: text('at').notNull(),
  metadata: text('metadata', { mode: 'json' }).$type<AuditMetadata>(),
});

const CREATE_TABLE = sql`
  CREATE TABLE IF NOT EXISTS audit_events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    actor_principal_id TEXT NOT NULL,
    actor_kind TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT,
    outcome TEXT NOT NULL,
    at TEXT NOT NULL,
    metadata TEXT
  )
`;

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

export function createSqliteAuditLog(db: BetterSQLite3Database): AuditLog {
  db.run(CREATE_TABLE);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_audit_tenant_seq ON audit_events (tenant_id, seq)`);
  db.run(
    sql`CREATE INDEX IF NOT EXISTS idx_audit_tenant_action ON audit_events (tenant_id, action)`,
  );

  function storeFor(tenantId: TenantId): AuditLog {
    const inTenant = eq(auditEvents.tenantId, tenantId);
    return {
      record(input) {
        db.insert(auditEvents)
          .values({
            id: newId<'Audit'>(),
            tenantId, // stamp the bound tenant regardless of the input's tenantId
            actorPrincipalId: input.actor.principalId,
            actorKind: input.actor.kind,
            action: input.action,
            target: input.target ?? null,
            outcome: input.outcome,
            at: input.at ?? new Date().toISOString(),
            metadata: input.metadata ?? null,
          })
          .run();
        return Promise.resolve();
      },

      query(query = {}) {
        // Clamp, and use the shared default rather than a hardcoded 50 — the in-memory adapter has
        // always done both and this one did neither, so the two disagreed for any caller reaching the
        // port directly (below the route schema that clamps). The conformance suite now covers it.
        const limit = Math.min(query.limit ?? DEFAULT_AUDIT_PAGE_SIZE, MAX_AUDIT_PAGE_SIZE);
        const conditions: SQL[] = [inTenant];
        if (query.action !== undefined) conditions.push(eq(auditEvents.action, query.action));
        if (query.actor !== undefined) {
          conditions.push(eq(auditEvents.actorPrincipalId, query.actor));
        }
        if (query.outcome !== undefined) conditions.push(eq(auditEvents.outcome, query.outcome));
        if (query.since !== undefined) conditions.push(gte(auditEvents.at, query.since));
        if (query.until !== undefined) conditions.push(lte(auditEvents.at, query.until));
        if (query.cursor !== undefined) conditions.push(lt(auditEvents.seq, Number(query.cursor)));

        // Fetch one extra to learn whether a next page exists without a second count query.
        const rows = db
          .select()
          .from(auditEvents)
          .where(and(...conditions))
          .orderBy(desc(auditEvents.seq))
          .limit(limit + 1)
          .all();

        const hasMore = rows.length > limit;
        const pageRows = hasMore ? rows.slice(0, limit) : rows;
        const lastRow = pageRows[pageRows.length - 1];
        const result: AuditPage =
          hasMore && lastRow !== undefined
            ? { events: pageRows.map(toEvent), nextCursor: String(lastRow.seq) }
            : { events: pageRows.map(toEvent) };
        return Promise.resolve(result);
      },

      activity(query) {
        const actions = query.actions ?? ACTIVITY_ACTIONS;
        // GROUP BY the viewer's calendar day, counting only "work" actions in the window — AT THE
        // STORE. The day is `date(at, '<n> minutes')` (F-088): SQLite parses the ISO `Z` form and
        // applies the signed minute modifier, so offset 0 reproduces the UTC day the pre-F-088
        // `substr(at, 1, 10)` read. Modifier + `IN (…)` are parameterised (drizzle `sql`/`inArray`).
        const dayModifier = `${query.tzOffsetMinutes ?? 0} minutes`;
        const localDay = sql<string>`date(${auditEvents.at}, ${dayModifier})`;
        const rows = db
          .select({
            date: localDay,
            count: sql<number>`count(*)`,
          })
          .from(auditEvents)
          .where(
            and(
              inTenant,
              inArray(auditEvents.action, actions as AuditAction[]),
              gte(auditEvents.at, query.since),
              lte(auditEvents.at, query.until),
            ),
          )
          .groupBy(localDay)
          .orderBy(localDay)
          .all();

        // The retention floor — MIN(at) over the WHOLE tenant trail (any action), so a chart never
        // draws a pruned day as silence (ADR-0053 clause 3). `null` for an empty trail.
        const [floor] = db
          .select({ earliest: sql<string | null>`min(${auditEvents.at})` })
          .from(auditEvents)
          .where(inTenant)
          .all();

        const result: ActivityResult = {
          buckets: rows.map((row) => ({ date: row.date, count: Number(row.count) })),
          earliest: floor?.earliest ?? null,
        };
        return Promise.resolve(result);
      },

      prune(policy) {
        let pruned = 0;
        if (policy.maxAgeMs !== undefined) {
          const cutoff = new Date(Date.now() - policy.maxAgeMs).toISOString();
          const result = db.run(
            sql`DELETE FROM audit_events WHERE tenant_id = ${tenantId} AND at < ${cutoff}`,
          );
          pruned += result.changes;
        }
        if (policy.maxEntries !== undefined) {
          const result = db.run(
            sql`DELETE FROM audit_events WHERE tenant_id = ${tenantId} AND seq NOT IN (
              SELECT seq FROM audit_events WHERE tenant_id = ${tenantId}
              ORDER BY seq DESC LIMIT ${policy.maxEntries}
            )`,
          );
          pruned += result.changes;
        }
        return Promise.resolve(pruned);
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
