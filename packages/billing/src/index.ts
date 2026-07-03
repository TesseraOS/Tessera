/**
 * @tessera/billing — plans, subscriptions, and a `BillingProvider` port (F-030; FR-61, NFR-12).
 *
 * Tessera is **open-core** (OQ4): the domain + the **local/free** adapter are OSS and need zero
 * external services; the **Dodo Payments** adapter serves the paid Managed Cloud tier behind the same
 * port (ADR-0011/0031). The REST surface lives in `@tessera/api`; wiring is `@tessera/config` (F-034).
 */
export * from './domain.js';
export * from './ports.js';
export * from './subscription-store.js';
export * from './adapters/local.js';
export * from './adapters/dodo.js';
