import { createStaticFlagProvider, type FlagProvider } from '@tessera/core';
import type { ZodFastify } from '../../app-types.js';
import { requirePermission, tenantOf } from '../../auth/index.js';
import { flagsResponseSchema } from '../../schemas/flags.js';

/**
 * `GET /v1/flags` — the feature flags in effect for the calling tenant (F-058; FR-57).
 *
 * **`stats:read`**, which every reader role already holds. A principal needs to know which features
 * apply to it, and minting a `flags:read` permission would ripple `GET /v1/rbac` → OpenAPI → SDK →
 * the dashboard's token-scope UI to gate a read that reveals nothing but this tenant's own posture.
 *
 * **Not audited**, the `/v1/stats` and `/v1/usage` posture: the dashboard reads it on every Settings
 * load, and flooding the F-027 trail with that degrades the compliance signal it exists to give.
 *
 * When no provider is wired the route answers with an **empty catalog rather than a 409** — unlike
 * `/v1/usage`, which 409s without a store. The difference is real: an empty flag catalog is the
 * default state of every Tessera deployment, so "no flags are declared" is a true answer, whereas
 * "this tenant has no usage" would have been a fabricated one.
 */
export function registerFlagsRoutes(app: ZodFastify, flags?: FlagProvider): void {
  const provider = flags ?? createStaticFlagProvider();

  app.get(
    '/flags',
    {
      preHandler: requirePermission('stats:read'),
      schema: {
        tags: ['ops'],
        summary: 'Feature flags in effect for the calling tenant.',
        description:
          'Read-only (FR-57). Flags are declared in deployment config; each is evaluated for the ' +
          "caller's tenant, and `source` says whether the value came from the flag default or from " +
          'an explicit override for this tenant. Empty when the deployment declares no flags.',
        response: { 200: flagsResponseSchema },
      },
    },
    (request) => ({ flags: [...provider.evaluateAll({ tenantId: tenantOf(request) })] }),
  );
}
