/**
 * Data-subject rights (NFR-13; F-047, ADR-0049). Tenant-scoped **export** (a complete JSON bundle of
 * memories + graph + sources + audit trail) and **erasure** of the data plane. Both are Fastify-free
 * (pure functions over {@link import('../services.js').ApiServices} + the {@link
 * import('./port.js').AuditLog}), so the composition root and tests can drive them directly; the
 * `admin:manage`-guarded, audited HTTP surface is `routes/v1/dsr.ts`.
 */
export { buildDsrBundle, type DsrBundle, type DsrSource } from './bundle.js';
export { purgeTenant, type DsrPurgeSummary } from './purge.js';
