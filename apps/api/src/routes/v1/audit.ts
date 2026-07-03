import type { ZodFastify } from '../../app-types.js';
import { requirePermission, tenantOf } from '../../auth/index.js';
import { DEFAULT_AUDIT_PAGE_SIZE, type AuditLog, type AuditQuery } from '../../audit/index.js';
import {
  auditPageResponseSchema,
  auditQuerySchema,
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
}
