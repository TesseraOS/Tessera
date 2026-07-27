/**
 * @tessera/billing — plans, subscriptions, and a `BillingProvider` port (F-030; FR-61, NFR-12).
 *
 * Tessera is **open-core** (OQ4): the domain + the **local/free** adapter are OSS and need zero
 * external services; the **Dodo Payments** adapter serves the paid Managed Cloud tier behind the same
 * port (ADR-0011/0031). The REST surface lives in `@tessera/api`; wiring is `@tessera/config` (F-034).
 */
export * from './domain.js';
export * from './budget.js';
export * from './ports.js';
export * from './subscription-store.js';
export * from './adapters/local.js';
export * from './adapters/dodo.js';
// Durable SubscriptionStore adapters (F-057; closes the F-030 in-memory seam — ADR-0060 §7).
export * from './adapters/subscription-row.js';
export * from './adapters/sqlite-subscription-store.js';
export * from './adapters/postgres-subscription-store.js';

// Per-tenant usage metering (F-057; NFR-12, FR-47 — ADR-0060). It lives here, beside the entitlements
// it exists to serve: a counter and the limit it is measured against belong in one package, or they drift.
export * from './usage/period.js';
export * from './usage/ports.js';
export * from './usage/adapters/in-memory-usage-store.js';
export * from './usage/adapters/sqlite-usage-store.js';
export * from './usage/adapters/postgres-usage-store.js';
