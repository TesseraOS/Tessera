import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ZodFastify } from '../../app-types.js';
import { registerAuth, type AuthProvider } from '../../auth/index.js';
import { recordAudit, type AuditLog } from '../../audit/index.js';
import type { ApiEventBus } from '../../events.js';
import type { ApiServices } from '../../services.js';
import { registerSearchRoutes } from './search.js';
import { registerCompileRoutes } from './compile.js';
import { registerEffectsRoutes } from './effects.js';
import { registerGraphRoutes } from './graph.js';
import { registerMemoryRoutes } from './memory.js';
import { registerSourceRoutes } from './sources.js';
import { registerEventsRoutes } from './events.js';
import { registerBillingRoutes } from './billing.js';
import { registerAuditRoutes } from './audit.js';

/**
 * Mount every data route under the `/v1` prefix (NFR-11: versioned, additive). Also serves the
 * generated OpenAPI document at `GET /v1/openapi.json` (`app.swagger()` is decorated by
 * `@fastify/swagger` and inherited by this child instance). Enqueued synchronously — the plugin
 * queue runs in order at boot, so never `await app.register` here.
 */
export function registerV1Routes(
  app: ZodFastify,
  services: ApiServices,
  events: ApiEventBus,
  auth: AuthProvider,
  audit: AuditLog,
): void {
  app.register(
    (instance, _opts, done) => {
      const v1 = instance.withTypeProvider<ZodTypeProvider>();
      // Authenticate every /v1 request first (per-route authorization is in each route module).
      registerAuth(v1, auth);
      // Record an audit event per response for routes flagged with an `audit` action (FR-55).
      recordAudit(v1, audit);
      registerSearchRoutes(v1, services);
      registerCompileRoutes(v1, services);
      registerEffectsRoutes(v1, services);
      registerGraphRoutes(v1, services);
      registerMemoryRoutes(v1, services, events);
      registerSourceRoutes(v1, services);
      registerEventsRoutes(v1, events);
      registerBillingRoutes(v1, services);
      registerAuditRoutes(v1, audit);

      v1.get(
        '/openapi.json',
        {
          schema: { tags: ['ops'], description: 'Generated OpenAPI document.' },
          // The API contract is public — the auth hook skips it (see registerAuth).
          config: { public: true },
        },
        () => app.swagger(),
      );

      done();
    },
    { prefix: '/v1' },
  );
}
