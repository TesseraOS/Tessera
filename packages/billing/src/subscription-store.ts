import type { Subscription } from './domain.js';
import type { SubscriptionStore } from './ports.js';

/**
 * In-memory {@link SubscriptionStore} — the Local adapter. Sufficient for a single instance; a
 * persistent (SQLite/Postgres) store for the cloud profile is a documented seam (mirrors the token
 * store pattern in `@tessera/config`).
 */
export function createInMemorySubscriptionStore(): SubscriptionStore {
  const byTenant = new Map<string, Subscription>();
  return {
    get(tenantId) {
      return Promise.resolve(byTenant.get(tenantId) ?? null);
    },
    upsert(subscription) {
      byTenant.set(subscription.tenantId, subscription);
      return Promise.resolve();
    },
  };
}
