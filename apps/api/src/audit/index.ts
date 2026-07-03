/**
 * Audit trail (FR-55, NFR-13; ADR-0034). The model + port + in-memory adapter are Fastify-free (so the
 * composition root can build a persistent adapter without pulling Fastify); {@link recordAudit} is the
 * Fastify recording hook. `buildServer` injects an {@link AuditLog} (default in-memory) and mounts
 * `GET /v1/audit`.
 */
export * from './model.js';
export type { AuditLog } from './port.js';
export { createInMemoryAuditLog } from './in-memory.js';
export { recordAudit } from './recorder.js';
