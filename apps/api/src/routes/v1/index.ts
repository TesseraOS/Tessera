import type { MemoryRetentionPolicy } from '@tessera/memory';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ZodFastify } from '../../app-types.js';
import { registerAuth, type AuthProvider, type TokenStore } from '../../auth/index.js';
import { recordAudit, type AuditLog } from '../../audit/index.js';
import type { ApiEventBus } from '../../events.js';
import { registerRateLimit, type RateLimiter } from '../../security/rate-limit.js';
import type { SecurityHeadersOptions } from '../../security/headers.js';
import type { ApiServices } from '../../services.js';
import { registerSearchRoutes } from './search.js';
import { registerCompileRoutes } from './compile.js';
import { registerEffectsRoutes } from './effects.js';
import { registerGraphRoutes } from './graph.js';
import { registerMemoryRoutes } from './memory.js';
import { registerSourceRoutes } from './sources.js';
import { registerProjectRoutes } from './projects.js';
import { registerStatsRoutes } from './stats.js';
import { registerEventsRoutes } from './events.js';
import { registerBillingRoutes } from './billing.js';
import { registerAuditRoutes } from './audit.js';
import { registerDsrRoutes } from './dsr.js';
import { registerMeRoutes } from './me.js';
import { registerRbacRoutes } from './rbac.js';
import { registerRetentionRoutes } from './retention.js';
import { registerTokenRoutes } from './tokens.js';

/** Cross-cutting hardening threaded into the `/v1` scope (F-044). */
export interface V1HardeningOptions {
  /** Security headers reused by the hijacked SSE handler's `writeHead`. */
  readonly security: SecurityHeadersOptions;
  /** The rate limiter for `/v1`, or `undefined` when rate limiting is off. */
  readonly rateLimiter: RateLimiter | undefined;
  /** The token store backing `/v1/tokens` (F-046), or `undefined` in zero-auth mode. */
  readonly tokenStore: TokenStore | undefined;
  /** The effective memory retention policy backing `/v1/retention` (F-047); empty ⇒ retention off. */
  readonly memoryRetention: MemoryRetentionPolicy;
}

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
  hardening: V1HardeningOptions,
): void {
  app.register(
    (instance, _opts, done) => {
      const v1 = instance.withTypeProvider<ZodTypeProvider>();
      // Authenticate every /v1 request first (per-route authorization is in each route module).
      registerAuth(v1, auth);
      // Rate limit AFTER auth so the key can use the resolved principal (fallback per-IP) (F-044).
      if (hardening.rateLimiter !== undefined) {
        registerRateLimit(v1, { limiter: hardening.rateLimiter });
      }
      // Record an audit event per response for routes flagged with an `audit` action (FR-55).
      recordAudit(v1, audit);
      registerMeRoutes(v1);
      registerRbacRoutes(v1);
      registerTokenRoutes(v1, hardening.tokenStore);
      registerSearchRoutes(v1, services);
      registerCompileRoutes(v1, services);
      registerEffectsRoutes(v1, services);
      registerGraphRoutes(v1, services);
      registerMemoryRoutes(v1, services, events);
      registerSourceRoutes(v1, services);
      registerProjectRoutes(v1, services);
      registerStatsRoutes(v1, services, audit);
      registerEventsRoutes(v1, events, hardening.security);
      registerBillingRoutes(v1, services);
      registerAuditRoutes(v1, audit);
      registerRetentionRoutes(v1, services, hardening.memoryRetention);
      registerDsrRoutes(v1, services, audit);

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
