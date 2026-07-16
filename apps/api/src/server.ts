import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';
import cors from '@fastify/cors';
import { EMPTY_RETENTION_POLICY, type MemoryRetentionPolicy } from '@tessera/memory';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { ZodFastify } from './app-types.js';
import { createLocalAuthProvider, type AuthProvider, type TokenStore } from './auth/index.js';
import { createInMemoryAuditLog, type AuditLog } from './audit/index.js';
import { createApiEventBus, type ApiEventBus } from './events.js';
import { registerErrorHandling } from './errors/error-handler.js';
import { registerOpenapi } from './plugins/openapi.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerV1Routes } from './routes/v1/index.js';
import { registerSecurityHeaders, type SecurityHeadersOptions } from './security/headers.js';
import { REQUEST_ID_LOG_LABEL, registerRequestId, requestIdFrom } from './security/request-id.js';
import { createInMemoryRateLimiter, type RateLimiter } from './security/rate-limit.js';
import type { ApiServices } from './services.js';

/** Default request body cap (1 MiB) — bounds memory and abuse; override per deployment profile. */
const DEFAULT_BODY_LIMIT = 1_000_000;

/** Rate-limit defaults when enabled without explicit numbers (120 requests / minute per key). */
const DEFAULT_RATE_LIMIT = 120;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Per-profile CORS: an explicit `allowedOrigins` allowlist replaces the blanket loopback policy for
 * hosted/self-host deployments (ADR-0035 app↔api cross-origin). Omitted/empty ⇒ the permissive
 * loopback default (local dev + the local dashboard) is used.
 */
export interface CorsOptions {
  readonly allowedOrigins?: readonly string[];
}

/**
 * Rate-limit wiring for `/v1` (NFR-1). Pass a ready {@link RateLimiter} (tests, distributed seam) or
 * `enabled` with `limit`/`windowMs` to build the in-memory fixed-window adapter. Omitted ⇒ no rate
 * limiting (the local default; existing behavior unchanged).
 */
export interface RateLimitOptions {
  readonly enabled?: boolean;
  readonly limit?: number;
  readonly windowMs?: number;
  /** A pre-built limiter (wins over `enabled`/`limit`/`windowMs`). */
  readonly limiter?: RateLimiter;
}

/** Resolve {@link RateLimitOptions} to a limiter, or `undefined` when rate limiting is off. */
function resolveRateLimiter(options: RateLimitOptions | undefined): RateLimiter | undefined {
  if (options === undefined) return undefined;
  if (options.limiter !== undefined) return options.limiter;
  if (options.enabled !== true) return undefined;
  return createInMemoryRateLimiter({
    limit: options.limit ?? DEFAULT_RATE_LIMIT,
    windowMs: options.windowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS,
  });
}

/**
 * Build the `@fastify/cors` origin delegate. No `Origin` header ⇒ allow (same-origin / non-browser /
 * server-to-server). With an allowlist ⇒ allow iff the origin matches exactly. Without one ⇒ the
 * loopback-permissive default (`localhost`/`127.0.0.1`/`*.localhost`).
 */
function corsOriginDelegate(
  allowedOrigins: readonly string[] | undefined,
): (origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) => void {
  const allowlist =
    allowedOrigins !== undefined && allowedOrigins.length > 0 ? new Set(allowedOrigins) : undefined;
  return (origin, cb) => {
    if (!origin) {
      cb(null, true);
      return;
    }
    if (allowlist !== undefined) {
      cb(allowlist.has(origin) ? null : new Error('Not allowed by CORS'), allowlist.has(origin));
      return;
    }
    try {
      const url = new URL(origin);
      if (
        url.hostname === 'localhost' ||
        url.hostname === '127.0.0.1' ||
        url.hostname.endsWith('.localhost')
      ) {
        cb(null, true);
        return;
      }
    } catch {
      // ignore invalid urls
    }
    cb(new Error('Not allowed by CORS'), false);
  };
}

export interface BuildServerOptions {
  /** Pino logger config; `false` (default) keeps tests quiet. */
  readonly logger?: FastifyServerOptions['logger'];
  /**
   * A pre-built logger instance (e.g. `@tessera/observability`'s redacting Pino logger, F-016).
   * Mutually exclusive with `logger`; when set, it backs per-request logging + correlation ids.
   */
  readonly loggerInstance?: FastifyBaseLogger;
  /** Max request body size in bytes (default {@link DEFAULT_BODY_LIMIT}). */
  readonly bodyLimit?: number;
  /**
   * The event bus backing the `/v1/events` SSE stream (FR-38). Defaults to a fresh in-process bus;
   * the composition root passes a shared one so producers (memory route, ingestion worker) can emit.
   */
  readonly events?: ApiEventBus;
  /**
   * The authentication provider guarding `/v1` (F-025; FR-52/FR-54/NFR-2). Defaults to the zero-auth
   * Local provider (full access, single default tenant) so local behavior is unchanged; hosted/self-
   * host profiles inject a token/OIDC provider. See {@link AuthProvider} and ADR-0028.
   */
  readonly auth?: AuthProvider;
  /**
   * The audit trail sink (F-027; FR-55/NFR-13). Defaults to a fresh in-memory log; the composition
   * root passes a persistent, tenant-scoped one. Sensitive routes (flagged `audit` in their config)
   * record an event per response; `GET /v1/audit` (admin) queries it. See {@link AuditLog} + ADR-0034.
   */
  readonly audit?: AuditLog;
  /**
   * The token store backing `/v1/tokens` self-service (F-046; ADR-0036). The composition root passes
   * `runtime.auth.tokenStore` (present in `token` mode); in zero-auth Local mode there is none and the
   * `/v1/tokens` routes answer a clean `409`. See {@link TokenStore}.
   */
  readonly tokenStore?: TokenStore;
  /**
   * The effective memory retention policy backing `/v1/retention` (F-047; FR-15). The composition root
   * passes `runtime.memoryRetention` (resolved from `config.memory.retention`). Omitted ⇒ the empty
   * policy: retention is off and the prune pass is a no-op.
   */
  readonly memoryRetention?: MemoryRetentionPolicy;
  /**
   * Security-header hardening (F-044; NFR-2). Headers are on by default; `security.hsts` adds HSTS
   * for TLS-terminated profiles. See {@link SecurityHeadersOptions}.
   */
  readonly security?: SecurityHeadersOptions;
  /**
   * Per-profile CORS allowlist (F-044). Omitted ⇒ loopback-permissive (local default). See
   * {@link CorsOptions}.
   */
  readonly cors?: CorsOptions;
  /**
   * Rate limiting on `/v1` (F-044). Omitted ⇒ off (local default). See {@link RateLimitOptions}.
   */
  readonly rateLimit?: RateLimitOptions;
}

export interface ListenOptions extends BuildServerOptions {
  readonly host?: string;
  readonly port?: number;
}

/**
 * Build the Tessera HTTP server around the injected {@link ApiServices}. Routes are thin
 * (validate → call service → map result); cross-cutting concerns are plugins. Registration order
 * matters: the Zod compilers and error envelope are installed first, then `@fastify/swagger`
 * (so its `onRoute` hook captures every route), then the routes. The instance is **not** awaited
 * here — `inject`/`listen` boot the plugin queue in order. `/v1` is guarded by the injected
 * {@link AuthProvider} (F-025; default = zero-auth Local); CORS is per profile; adapter wiring is
 * F-015. This function is pure given its services + options.
 */
export function buildServer(services: ApiServices, options: BuildServerOptions = {}): ZodFastify {
  // Fastify forbids `logger` + `loggerInstance` together; prefer the injected instance when present.
  // `requestIdHeader: false` disables raw header pickup so our sanitizing `genReqId` fully controls
  // the id (honoring a well-formed inbound `x-request-id`, else generating one) — no injection risk.
  const correlationOptions: FastifyServerOptions = {
    genReqId: requestIdFrom,
    requestIdHeader: false,
    requestIdLogLabel: REQUEST_ID_LOG_LABEL,
    bodyLimit: options.bodyLimit ?? DEFAULT_BODY_LIMIT,
  };
  const fastifyOptions: FastifyServerOptions =
    options.loggerInstance !== undefined
      ? { ...correlationOptions, loggerInstance: options.loggerInstance }
      : { ...correlationOptions, logger: options.logger ?? false };
  const app = Fastify(fastifyOptions).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  registerErrorHandling(app);

  // Cross-cutting hardening on every response (F-044): correlation id echo + security headers.
  registerRequestId(app);
  registerSecurityHeaders(app, options.security ?? {});

  app.register(cors, {
    origin: corsOriginDelegate(options.cors?.allowedOrigins),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: [
      'X-Request-Id',
      'RateLimit-Limit',
      'RateLimit-Remaining',
      'RateLimit-Reset',
      'Retry-After',
    ],
    credentials: true,
  });

  // Must precede route registration so the OpenAPI collector sees every route.
  registerOpenapi(app);

  app.register((instance, _opts, done) => {
    registerHealthRoutes(instance.withTypeProvider<ZodTypeProvider>(), services);
    done();
  });

  registerV1Routes(
    app,
    services,
    options.events ?? createApiEventBus(),
    options.auth ?? createLocalAuthProvider(),
    options.audit ?? createInMemoryAuditLog(),
    {
      security: options.security ?? {},
      rateLimiter: resolveRateLimiter(options.rateLimit),
      tokenStore: options.tokenStore,
      memoryRetention: options.memoryRetention ?? EMPTY_RETENTION_POLICY,
    },
  );

  return app;
}

/** Build the server and start listening. Returns the listening instance. */
export async function startServer(
  services: ApiServices,
  options: ListenOptions = {},
): Promise<FastifyInstance> {
  const app = buildServer(services, options);
  await app.listen({ host: options.host ?? '127.0.0.1', port: options.port ?? 3000 });
  return app;
}
