import { DEFAULT_TENANT_ID, type TenantId } from '@tessera/core';
import {
  EMPTY_READ_STATE,
  withAllRead,
  withPreferenceDefaults,
  withRead,
  type NotificationKind,
  type NotificationPreferences,
  type NotificationReadState,
  type NotificationStore,
} from '@tessera/api';
import { and, eq, isNotNull, lt, sql, type SQL } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Persistent {@link NotificationStore} over the storage `SqliteStore`'s Drizzle handle (F-065;
 * ADR-0064) — the adapter that makes read state **cross-device**, which is the whole reason F-065
 * survived F-089: marks kept in one browser's `localStorage` are not read state, they are that
 * browser's opinion of it.
 *
 * Type-only import of the contract keeps `@tessera/config` (and the MCP process booting through it)
 * Fastify-free (ADR-0030), mirroring `createSqliteAuditLog` and `createSqliteTokenStore`.
 *
 * One row per `(tenant_id, principal_id)`: the composite primary key *is* the isolation guarantee
 * the conformance suite checks from the outside. Read marks and preferences share the row because
 * they share a lifetime (a principal), but they are pruned differently — see `prune`.
 */
const notificationState = sqliteTable('notification_state', {
  tenantId: text('tenant_id').$type<TenantId>().notNull(),
  principalId: text('principal_id').notNull(),
  /** ISO instant at/below which everything is read; `null` until "mark all as read" is used. */
  watermark: text('watermark'),
  /** Individually-read ids newer than the watermark, capped by the domain helper. */
  readIds: text('read_ids', { mode: 'json' }).$type<string[]>(),
  /** Epoch ms of the last read-state change — what `prune` ages out. */
  readStateUpdatedAt: integer('read_state_updated_at'),
  /** PARTIAL preferences: only what was explicitly set, so an unknown kind defaults rather than mutes. */
  preferences: text('preferences', { mode: 'json' }).$type<
    Partial<Record<NotificationKind, boolean>>
  >(),
});

const CREATE_TABLE = sql`
  CREATE TABLE IF NOT EXISTS notification_state (
    tenant_id TEXT NOT NULL,
    principal_id TEXT NOT NULL,
    watermark TEXT,
    read_ids TEXT,
    read_state_updated_at INTEGER,
    preferences TEXT,
    PRIMARY KEY (tenant_id, principal_id)
  )
`;

type StateRow = typeof notificationState.$inferSelect;

function toReadState(row: StateRow | undefined): NotificationReadState {
  if (row === undefined) return EMPTY_READ_STATE;
  return { watermark: row.watermark, readIds: row.readIds ?? [] };
}

export function createSqliteNotificationStore(db: BetterSQLite3Database): NotificationStore {
  db.run(CREATE_TABLE);

  function storeFor(tenantId: TenantId): NotificationStore {
    const inTenant = eq(notificationState.tenantId, tenantId);
    const rowFor = (principalId: string): SQL =>
      and(inTenant, eq(notificationState.principalId, principalId)) as SQL;

    function load(principalId: string): StateRow | undefined {
      return db.select().from(notificationState).where(rowFor(principalId)).limit(1).all()[0];
    }

    /**
     * Upsert the read-state half of a row, leaving preferences untouched. `onConflictDoUpdate` on the
     * composite key rather than a read-then-write: two tabs marking rows in the same tick must not
     * lose one of the writes, and the tenant is part of the key so the update can never cross into
     * another tenant's row.
     */
    function saveReadState(principalId: string, state: NotificationReadState): void {
      db.insert(notificationState)
        .values({
          tenantId,
          principalId,
          watermark: state.watermark,
          readIds: [...state.readIds],
          readStateUpdatedAt: Date.now(),
          preferences: null,
        })
        .onConflictDoUpdate({
          target: [notificationState.tenantId, notificationState.principalId],
          set: {
            watermark: state.watermark,
            readIds: [...state.readIds],
            readStateUpdatedAt: Date.now(),
          },
        })
        .run();
    }

    return {
      readState(principalId) {
        return Promise.resolve(toReadState(load(principalId)));
      },

      markRead(principalId, ids) {
        let next = toReadState(load(principalId));
        for (const id of ids) next = withRead(next, id);
        saveReadState(principalId, next);
        return Promise.resolve(next);
      },

      markAllRead(principalId, at) {
        const next = withAllRead(toReadState(load(principalId)), at);
        saveReadState(principalId, next);
        return Promise.resolve(next);
      },

      preferences(principalId) {
        return Promise.resolve(withPreferenceDefaults(load(principalId)?.preferences ?? undefined));
      },

      setPreferences(principalId, update) {
        // Merged over what is stored, not replaced — a client that predates a kind must not be able
        // to mute it by omitting it.
        const merged = { ...(load(principalId)?.preferences ?? {}), ...update };
        db.insert(notificationState)
          .values({ tenantId, principalId, preferences: merged })
          .onConflictDoUpdate({
            target: [notificationState.tenantId, notificationState.principalId],
            set: { preferences: merged },
          })
          .run();
        return Promise.resolve(withPreferenceDefaults(merged));
      },

      forget(principalId) {
        db.delete(notificationState).where(rowFor(principalId)).run();
        return Promise.resolve();
      },

      purge() {
        const result = db.delete(notificationState).where(inTenant).run();
        return Promise.resolve(result.changes);
      },

      prune(policy) {
        if (policy.readStateMaxAgeMs === undefined) return Promise.resolve(0);
        const cutoff = Date.now() - policy.readStateMaxAgeMs;
        // Clear the read-state columns; the row survives when it still carries preferences, and is
        // removed when it does not (nothing left to remember about this principal).
        const result = db
          .update(notificationState)
          .set({ watermark: null, readIds: null, readStateUpdatedAt: null })
          .where(
            and(
              inTenant,
              // Explicit rather than leaning on NULL-comparison semantics: the returned count is the
              // contract, and a row that never had read state must not be counted as pruned.
              isNotNull(notificationState.readStateUpdatedAt),
              lt(notificationState.readStateUpdatedAt, cutoff),
            ),
          )
          .run();
        db.run(
          sql`DELETE FROM notification_state
              WHERE tenant_id = ${tenantId}
                AND read_state_updated_at IS NULL
                AND (preferences IS NULL OR preferences = '{}')`,
        );
        return Promise.resolve(result.changes);
      },

      forTenant(next) {
        return storeFor(next);
      },
    };
  }

  return storeFor(DEFAULT_TENANT_ID);
}

// Re-exported so a caller building an update has the shapes to hand.
export type { NotificationPreferences, NotificationReadState };
