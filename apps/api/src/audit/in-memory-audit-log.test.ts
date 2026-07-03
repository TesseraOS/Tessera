import { runAuditLogConformance } from './audit-log.conformance.js';
import { createInMemoryAuditLog } from './in-memory.js';

// The in-memory adapter is the reference — it must satisfy the shared AuditLog contract (ADR-0034).
runAuditLogConformance('in-memory', () => Promise.resolve({ log: createInMemoryAuditLog() }));
