import type { ZodFastify } from '../../app-types.js';
import type { AuditLog } from '../../audit/index.js';
import { requirePermission, tenantOf } from '../../auth/index.js';
import {
  activityQuerySchema,
  activityResponseSchema,
  recentActivityQuerySchema,
  recentActivityResponseSchema,
  statsResponseSchema,
  type ActivityQueryString,
  type RecentActivityQueryString,
} from '../../schemas/stats.js';
import type { ApiServices } from '../../services.js';
import { computeWorkspaceActivity } from '../../stats/activity.js';
import { computeWorkspaceStats } from '../../stats/core.js';
import { computeRecentActivity } from '../../stats/recent.js';

/**
 * `GET /v1/stats` — the workspace summary (F-060; FR-38/FR-62): how much this tenant actually has
 * indexed, remembered, and connected. Backs the dashboard Overview's stat cards and the `get_stats`
 * MCP tool (ADR-0036 parity — one engine, two surfaces).
 *
 * The aggregation itself lives in {@link computeWorkspaceStats} (Fastify-free), which the `get_stats`
 * MCP tool calls too — so the two surfaces cannot drift into reporting different numbers for the
 * same tenant (ADR-0036). This route is the HTTP shell: authorize, resolve the tenant, serialize.
 *
 * **Not audited, deliberately.** It is a low-sensitivity aggregate read on every page load; writing
 * an audit row per load would flood the trail F-027 built and degrade the compliance signal it
 * exists to give. The mutating surfaces it summarizes are each audited at their own route.
 */
export function registerStatsRoutes(app: ZodFastify, services: ApiServices, audit: AuditLog): void {
  app.get(
    '/stats',
    {
      preHandler: requirePermission('stats:read'),
      schema: {
        tags: ['stats'],
        summary:
          'The workspace summary: indexed documents, memories, graph size, sources, last scan.',
        response: { 200: statsResponseSchema },
      },
    },
    (request) => computeWorkspaceStats(services, tenantOf(request)),
  );

  app.get<{ Querystring: ActivityQueryString }>(
    '/stats/activity',
    {
      preHandler: requirePermission('stats:read'),
      schema: {
        tags: ['stats'],
        summary:
          'Daily activity for the Overview chart — audit-derived, floored to the trail (F-084).',
        description:
          'Zero-filled per-day counts of workspace activity, bucketed into the viewer’s calendar ' +
          'days when `tzOffset` (minutes east of UTC) is sent, UTC days otherwise (F-088). `from` ' +
          'is the window the server actually used (clamped to the oldest event the trail holds), ' +
          'which the client must label; `points` is empty when the trail has no history. No trend ' +
          'field is added to /v1/stats.',
        querystring: activityQuerySchema,
        response: { 200: activityResponseSchema },
      },
      // Same posture as /stats: a low-sensitivity aggregate read on page load, not audited — a row
      // per load would flood the very trail this reads from.
    },
    (request) =>
      computeWorkspaceActivity(audit, tenantOf(request), {
        ...(request.query.days !== undefined ? { days: request.query.days } : {}),
        ...(request.query.tzOffset !== undefined
          ? { tzOffsetMinutes: request.query.tzOffset }
          : {}),
      }),
  );

  app.get<{ Querystring: RecentActivityQueryString }>(
    '/stats/activity/recent',
    {
      preHandler: requirePermission('stats:read'),
      schema: {
        tags: ['stats'],
        summary:
          'The last N successful work actions — what the Recent activity feed and the bell render (F-089).',
        description:
          'A narrowed, member-visible view of the audit trail: success only, work actions minus ' +
          'search, non-sensitive fields only (no outcome, no metadata; targets are ids or route ' +
          'patterns). Newest first; `limit` defaults to 20, max 50. The full trail stays behind ' +
          '/v1/audit (admin:manage).',
        querystring: recentActivityQuerySchema,
        response: { 200: recentActivityResponseSchema },
      },
      // Same posture as /stats and /stats/activity: an aggregate-grade read on every page load —
      // auditing it would flood the very trail it reads.
    },
    (request) =>
      computeRecentActivity(
        audit,
        tenantOf(request),
        request.query.limit !== undefined ? { limit: request.query.limit } : {},
      ),
  );
}
