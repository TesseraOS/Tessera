import { z } from 'zod/v4';
import { AUDIT_ACTIONS, MAX_AUDIT_PAGE_SIZE } from '../audit/model.js';

const outcomeSchema = z.enum(['success', 'denied']);

/** `GET /v1/audit` querystring — filter + paginate the trail (FR-48/55). `limit` arrives as a string. */
export const auditQuerySchema = z.object({
  action: z.enum(AUDIT_ACTIONS).optional().describe('Filter by action.'),
  actor: z.string().min(1).optional().describe('Filter by actor principal id.'),
  outcome: outcomeSchema.optional().describe('Filter by outcome.'),
  since: z.string().min(1).optional().describe('Inclusive lower time bound (ISO-8601).'),
  until: z.string().min(1).optional().describe('Inclusive upper time bound (ISO-8601).'),
  limit: z.coerce.number().int().positive().max(MAX_AUDIT_PAGE_SIZE).optional(),
  cursor: z.string().min(1).optional().describe('Opaque forward cursor from a prior page.'),
});

const auditActorSchema = z.object({
  principalId: z.string(),
  kind: z.enum(['local', 'user', 'token']),
});

/** One recorded audit event (non-sensitive: who/what/outcome/when). */
export const auditEventSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  actor: auditActorSchema,
  action: z.enum(AUDIT_ACTIONS),
  target: z.string().optional(),
  outcome: outcomeSchema,
  at: z.string(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

/** `GET /v1/audit` response — a page of events (newest-first) + an optional forward cursor. */
export const auditPageResponseSchema = z.object({
  events: z.array(auditEventSchema),
  nextCursor: z.string().optional(),
});

export type AuditQueryParams = z.infer<typeof auditQuerySchema>;
