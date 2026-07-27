import { eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { PlanId, Subscription, SubscriptionStatus } from '../domain.js';
import type { SubscriptionStore } from '../ports.js';
import { toSubscription } from './subscription-row.js';

/**
 * Drizzle schema for the `subscriptions` table — **one row per tenant**, which is the shape of the
 * contract: a tenant has exactly one current subscription, so the tenant id IS the primary key and an
 * upsert cannot leave two rows disagreeing about what a customer is paying for.
 */
const subscriptions = sqliteTable('subscriptions', {
  tenantId: text('tenant_id').primaryKey(),
  planId: text('plan_id').$type<PlanId>().notNull(),
  status: text('status').$type<SubscriptionStatus>().notNull(),
  currentPeriodEnd: text('current_period_end'),
  externalId: text('external_id'),
});

const CREATE_TABLE = sql`
  CREATE TABLE IF NOT EXISTS subscriptions (
    tenant_id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL,
    status TEXT NOT NULL,
    current_period_end TEXT,
    external_id TEXT
  )
`;

/**
 * SQLite {@link SubscriptionStore} — the durable store for the Local profile (ADR-0060 §7).
 *
 * It exists because `profile: local` + `billing.provider: dodo` is a legal configuration today and a
 * plausible open-core shape: a self-hoster on a paid plan. Without it, that deployment loses every
 * paying tenant's plan on restart, which is the F-030 seam this closes.
 */
export function createSqliteSubscriptionStore(db: BetterSQLite3Database): SubscriptionStore {
  db.run(CREATE_TABLE);

  return {
    get(tenantId: string): Promise<Subscription | null> {
      const row = db.select().from(subscriptions).where(eq(subscriptions.tenantId, tenantId)).get();
      return Promise.resolve(row === undefined ? null : toSubscription(row));
    },

    upsert(subscription: Subscription): Promise<void> {
      const values = {
        tenantId: subscription.tenantId,
        planId: subscription.planId,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        externalId: subscription.externalId ?? null,
      };
      db.insert(subscriptions)
        .values(values)
        // Replace, never append — a second row for a tenant would be two answers to "what plan is
        // this customer on", and a webhook stream produces many updates for one subscription.
        .onConflictDoUpdate({ target: subscriptions.tenantId, set: values })
        .run();
      return Promise.resolve();
    },
  };
}
