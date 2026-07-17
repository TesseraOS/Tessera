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

/**
 * `GET /v1/audit/export` querystring — the same filters as the page query, **minus the paging
 * controls**: an export is defined by its filters, not by where you happened to have scrolled to.
 * The server follows the cursor to completeness itself.
 */
export const auditExportQuerySchema = auditQuerySchema.omit({ limit: true, cursor: true });

/**
 * `GET /v1/audit/export` response — **data, not bytes**.
 *
 * The server never emits CSV. It owns the two things a client cannot know or assert honestly: that
 * these are *all* the rows matching the filters (completeness is a fact about the data), and that an
 * export happened at all (an audit event a client asserted about itself would be forgeable). Turning
 * rows into CSV is a re-formatting of data the caller now holds — no truth to disagree about — so it
 * stays in the client.
 */
export const auditExportResponseSchema = z.object({
  exportedAt: z.string().describe('When the server assembled this export (ISO-8601).'),
  count: z.number().int().nonnegative(),
  truncated: z
    .boolean()
    .describe(
      'True when the export hit its row cap and is a PREFIX of the matching trail, not all of it. Narrow the date range for the rest.',
    ),
  events: z.array(auditEventSchema),
});

export type AuditQueryParams = z.infer<typeof auditQuerySchema>;
export type AuditExportQueryParams = z.infer<typeof auditExportQuerySchema>;
