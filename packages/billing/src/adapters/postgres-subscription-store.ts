import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { pgTable, text } from 'drizzle-orm/pg-core';
import type { PlanId, Subscription, SubscriptionStatus } from '../domain.js';
import type { SubscriptionStore } from '../ports.js';
import { toSubscription } from './subscription-row.js';

/** Drizzle schema for the Postgres `subscriptions` table — the same columns the SQLite adapter defines. */
const subscriptions = pgTable('subscriptions', {
  tenantId: text('tenant_id').primaryKey(),
  planId: text('plan_id').$type<PlanId>().notNull(),
  status: text('status').$type<SubscriptionStatus>().notNull(),
  currentPeriodEnd: text('current_period_end'),
  externalId: text('external_id'),
});

/**
 * Schema for the Postgres SubscriptionStore (ADR-0059 §2, ADR-0060 §7). Applied once by the
 * composition root under an advisory lock — the adapter never creates its own tables.
 */
export const pgSubscriptionMigrations: readonly { id: string; up: readonly string[] }[] = [
  {
    id: 'f057-subscriptions-001',
    up: [
      `CREATE TABLE IF NOT EXISTS subscriptions (
        tenant_id text PRIMARY KEY,
        plan_id text NOT NULL,
        status text NOT NULL,
        current_period_end text,
        external_id text
      )`,
      // Webhooks arrive keyed by the PROVIDER's id, so resolving one to a tenant is a real read path.
      `CREATE INDEX IF NOT EXISTS idx_subscriptions_external
         ON subscriptions (external_id) WHERE external_id IS NOT NULL`,
    ],
  },
];

/**
 * Postgres {@link SubscriptionStore} — the durable store for the self-hosted and cloud profiles.
 *
 * Closes the F-030 seam where plan state lived in one process's `Map`: on Managed Cloud a restart (or
 * a second replica) silently downgraded every paying tenant to free, because nothing outside that one
 * process had ever heard about the subscription.
 */
export function createPostgresSubscriptionStore(db: NodePgDatabase): SubscriptionStore {
  return {
    async get(tenantId: string): Promise<Subscription | null> {
      const rows = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.tenantId, tenantId))
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : toSubscription(row);
    },

    async upsert(subscription: Subscription): Promise<void> {
      const values = {
        tenantId: subscription.tenantId,
        planId: subscription.planId,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        externalId: subscription.externalId ?? null,
      };
      await db
        .insert(subscriptions)
        .values(values)
        .onConflictDoUpdate({ target: subscriptions.tenantId, set: values });
    },
  };
}
