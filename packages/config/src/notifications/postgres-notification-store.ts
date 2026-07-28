import { DEFAULT_TENANT_ID, type TenantId } from '@tessera/core';
import {
  EMPTY_READ_STATE,
  withAllRead,
  withPreferenceDefaults,
  withRead,
  type NotificationKind,
  type NotificationReadState,
  type NotificationStore,
} from '@tessera/api';
import { and, eq, isNotNull, lt, sql, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { bigint, jsonb, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

/**
 * Drizzle schema for the Postgres `notification_state` table — the same columns the SQLite adapter
 * defines, so the two adapters answer the shared conformance suite identically (F-065).
 *
 * `read_state_updated_at` is `bigint` in **number** mode: it holds epoch milliseconds, which exceed
 * a 32-bit `integer`, and raw node-postgres returns `bigint` as a *string* — a string would make
 * `prune`'s `<` comparison lexicographic and silently wrong.
 */
const notificationState = pgTable(
  'notification_state',
  {
    tenantId: text('tenant_id').$type<TenantId>().notNull(),
    principalId: text('principal_id').notNull(),
    watermark: text('watermark'),
    readIds: jsonb('read_ids').$type<string[]>(),
    readStateUpdatedAt: bigint('read_state_updated_at', { mode: 'number' }),
    preferences: jsonb('preferences').$type<Partial<Record<NotificationKind, boolean>>>(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.tenantId, table.principalId] }),
  }),
);

/** Schema for the Postgres {@link NotificationStore} (F-065; ADR-0059 §2 migration convention). */
export const pgNotificationStoreMigrations: readonly { id: string; up: readonly string[] }[] = [
  {
    id: 'f065-notification-state-001',
    up: [
      `CREATE TABLE IF NOT EXISTS notification_state (
        tenant_id text NOT NULL,
        principal_id text NOT NULL,
        watermark text,
        read_ids jsonb,
        read_state_updated_at bigint,
        preferences jsonb,
        PRIMARY KEY (tenant_id, principal_id)
      )`,
    ],
  },
];

type StateRow = typeof notificationState.$inferSelect;

function toReadState(row: StateRow | undefined): NotificationReadState {
  if (row === undefined) return EMPTY_READ_STATE;
  return { watermark: row.watermark, readIds: row.readIds ?? [] };
}

/**
 * Persistent {@link NotificationStore} for the self-hosted profile (F-056/F-065).
 *
 * **Required from this profile, not optional.** The comment on `ProfileAdapters.usageStore` states
 * the rule this follows: an optional member is exactly how a store ends up SQLite-only and caps
 * self-hosted at a single node. Cross-device read state is the one thing F-065 exists to deliver —
 * a multi-node deployment without it would deliver the opposite.
 *
 * **Tables must already exist** ({@link pgNotificationStoreMigrations}), matching the audit adapter.
 */
export function createPostgresNotificationStore(db: NodePgDatabase): NotificationStore {
  function storeFor(tenantId: TenantId): NotificationStore {
    const inTenant = eq(notificationState.tenantId, tenantId);
    const rowFor = (principalId: string): SQL =>
      and(inTenant, eq(notificationState.principalId, principalId)) as SQL;

    async function load(principalId: string): Promise<StateRow | undefined> {
      const rows = await db.select().from(notificationState).where(rowFor(principalId)).limit(1);
      return rows[0];
    }

    /** Upsert the read-state half, leaving the preferences column untouched. */
    async function saveReadState(principalId: string, state: NotificationReadState): Promise<void> {
      const now = Date.now();
      await db
        .insert(notificationState)
        .values({
          tenantId,
          principalId,
          watermark: state.watermark,
          readIds: [...state.readIds],
          readStateUpdatedAt: now,
          preferences: null,
        })
        .onConflictDoUpdate({
          target: [notificationState.tenantId, notificationState.principalId],
          set: {
            watermark: state.watermark,
            readIds: [...state.readIds],
            readStateUpdatedAt: now,
          },
        });
    }

    return {
      async readState(principalId) {
        return toReadState(await load(principalId));
      },

      async markRead(principalId, ids) {
        let next = toReadState(await load(principalId));
        for (const id of ids) next = withRead(next, id);
        await saveReadState(principalId, next);
        return next;
      },

      async markAllRead(principalId, at) {
        const next = withAllRead(toReadState(await load(principalId)), at);
        await saveReadState(principalId, next);
        return next;
      },

      async preferences(principalId) {
        return withPreferenceDefaults((await load(principalId))?.preferences ?? undefined);
      },

      async setPreferences(principalId, update) {
        // Merged over what is stored, not replaced — a client that predates a kind must not be able
        // to mute it by omitting it.
        const merged = { ...((await load(principalId))?.preferences ?? {}), ...update };
        await db
          .insert(notificationState)
          .values({ tenantId, principalId, preferences: merged })
          .onConflictDoUpdate({
            target: [notificationState.tenantId, notificationState.principalId],
            set: { preferences: merged },
          });
        return withPreferenceDefaults(merged);
      },

      async forget(principalId) {
        await db.delete(notificationState).where(rowFor(principalId));
      },

      async prune(policy) {
        if (policy.readStateMaxAgeMs === undefined) return 0;
        const cutoff = Date.now() - policy.readStateMaxAgeMs;
        // `IS NOT NULL` is explicit here rather than implied by the comparison: the returned count is
        // the contract, and a row that never had read state must not be counted as pruned.
        const cleared = await db
          .update(notificationState)
          .set({ watermark: null, readIds: null, readStateUpdatedAt: null })
          .where(
            and(
              inTenant,
              isNotNull(notificationState.readStateUpdatedAt),
              lt(notificationState.readStateUpdatedAt, cutoff),
            ),
          )
          .returning({ principalId: notificationState.principalId });

        // Nothing left to remember about this principal ⇒ drop the row entirely.
        await db.execute(
          sql`DELETE FROM notification_state
              WHERE tenant_id = ${tenantId}
                AND read_state_updated_at IS NULL
                AND (preferences IS NULL OR preferences = '{}'::jsonb)`,
        );
        return cleared.length;
      },

      forTenant(next) {
        return storeFor(next);
      },
    };
  }

  return storeFor(DEFAULT_TENANT_ID);
}
