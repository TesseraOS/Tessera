import { ConflictError } from '@tessera/core';
import type { UsageStore } from '@tessera/billing';
import type { ZodFastify } from '../../app-types.js';
import { requirePermission, tenantOf } from '../../auth/index.js';
import { projectOf } from '../../projects/selection.js';
import {
  usageQuerySchema,
  usageResponseSchema,
  type UsageQueryString,
} from '../../schemas/usage.js';
import type { ApiServices } from '../../services.js';
import { computeUsageSummary } from '../../usage/summary.js';

/**
 * `GET /v1/usage` — per-tenant usage, entitlement, latency and retrieval-quality proxies (F-057;
 * FR-47, NFR-12). Backs the dashboard Analytics and Billing views.
 *
 * **`admin:manage`**, an existing permission. A new one would ripple `GET /v1/rbac` → OpenAPI → SDK
 * → the dashboard's token-scope UI for no gain — usage is tenant-wide billing evidence, and the roles
 * that can already manage the tenant are exactly the ones that should read it.
 *
 * **Not audited, deliberately** — the same posture as `/v1/stats`: an aggregate read on every page
 * load would flood the trail F-027 built and degrade the compliance signal it exists to give.
 *
 * Registered even when no usage store is wired, so `buildServer({})` — which the SDK's OpenAPI
 * generator boots with empty services — still produces the document. Without a store it answers a
 * clean **409**, the `/v1/sources` idiom, rather than pretending the tenant has no usage.
 */
export function registerUsageRoutes(
  app: ZodFastify,
  services: ApiServices,
  usage?: UsageStore,
  metered = false,
): void {
  app.get<{ Querystring: UsageQueryString }>(
    '/usage',
    {
      preHandler: requirePermission('admin:manage'),
      schema: {
        tags: ['usage'],
        summary: 'Per-tenant usage, entitlement, latency and retrieval-quality proxies.',
        description:
          'Aggregated at the store over UTC day buckets. `from` is the window the server actually ' +
          'used (clamped to the earliest day held), which the client must label. Latency is a mean ' +
          'and a max — NOT a percentile. Totals and the daily series honour the X-Tessera-Project ' +
          'selection; `entitlement` is tenant-wide, because a subscription is.',
        querystring: usageQuerySchema,
        response: { 200: usageResponseSchema },
      },
    },
    (request) => {
      if (usage === undefined) {
        throw new ConflictError('usage metering is not configured for this deployment');
      }
      return computeUsageSummary(usage, tenantOf(request), {
        ...(request.query.days !== undefined ? { days: request.query.days } : {}),
        projectId: projectOf(request),
        ...(services.billing !== undefined ? { billing: services.billing } : {}),
        metered,
      });
    },
  );
}
