import type { ZodFastify } from '../../app-types.js';
import { requirePermission, tenantOf } from '../../auth/index.js';
import { DEFAULT_AUDIT_PAGE_SIZE, type AuditLog, type AuditQuery } from '../../audit/index.js';
import { collectAuditTrail, type AuditTrailFilters } from '../../audit/collect.js';
import {
  auditExportQuerySchema,
  auditExportResponseSchema,
  auditPageResponseSchema,
  auditQuerySchema,
  type AuditExportQueryParams,
  type AuditQueryParams,
} from '../../schemas/audit.js';

/**
 * `GET /v1/audit` — the caller-tenant's audit trail (FR-48/FR-55). Requires `admin:manage`; results are
 * newest-first, filtered + paginated, and **tenant-scoped** via `forTenant` (ADR-0033) so an admin only
 * ever sees their own tenant's events. The query itself is audited (`audit.read`).
 */
export function registerAuditRoutes(app: ZodFastify, auditLog: AuditLog): void {
  app.get<{ Querystring: AuditQueryParams }>(
    '/audit',
    {
      preHandler: requirePermission('admin:manage'),
      schema: {
        tags: ['audit'],
        summary: "Query this tenant's audit trail (admin only).",
        querystring: auditQuerySchema,
        response: { 200: auditPageResponseSchema },
      },
      config: { audit: 'audit.read' },
    },
    async (request) => {
      const { action, actor, outcome, since, until, limit, cursor } = request.query;
      const query: AuditQuery = {
        ...(action !== undefined ? { action } : {}),
        ...(actor !== undefined ? { actor } : {}),
        ...(outcome !== undefined ? { outcome } : {}),
        ...(since !== undefined ? { since } : {}),
        ...(until !== undefined ? { until } : {}),
        limit: limit ?? DEFAULT_AUDIT_PAGE_SIZE,
        ...(cursor !== undefined ? { cursor } : {}),
      };
      return auditLog.forTenant(tenantOf(request)).query(query);
    },
  );

  app.get<{ Querystring: AuditExportQueryParams }>(
    '/audit/export',
    {
      preHandler: requirePermission('admin:manage'),
      schema: {
        tags: ['audit'],
        summary:
          'Export every audit event matching the filters (admin only); the export is audited.',
        querystring: auditExportQuerySchema,
        response: { 200: auditExportResponseSchema },
      },
      // The whole reason this is a route and not a client-side loop over `GET /v1/audit`. FR-55 names
      // "exports" as an audited category in its own text, and paging the view N times would record N
      // `audit.read` events — INDISTINGUISHABLE from an admin scrolling. A compliance officer asking
      // "who took a copy of the trail?" could not answer. The recorder reads this action from static
      // route config, so it cannot vary per request — which is also why an `?export=true` flag on
      // `/v1/audit` was not an option.
      config: { audit: 'audit.export' },
    },
    async (request) => {
      const { action, actor, outcome, since, until } = request.query;
      const filters: AuditTrailFilters = {
        ...(action !== undefined ? { action } : {}),
        ...(actor !== undefined ? { actor } : {}),
        ...(outcome !== undefined ? { outcome } : {}),
        ...(since !== undefined ? { since } : {}),
        ...(until !== undefined ? { until } : {}),
      };

      // Tenant-scoped (ADR-0033) BEFORE the walk: `collectAuditTrail` pages whatever it is handed, so
      // scoping it here is what keeps one tenant's export free of another's events.
      const { events, truncated } = await collectAuditTrail(
        auditLog.forTenant(tenantOf(request)),
        filters,
      );

      return { exportedAt: new Date().toISOString(), count: events.length, truncated, events };
    },
  );
}
