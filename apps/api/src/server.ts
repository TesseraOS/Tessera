import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';
import cors from '@fastify/cors';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { ZodFastify } from './app-types.js';
import { createLocalAuthProvider, type AuthProvider } from './auth/index.js';
import { createInMemoryAuditLog, type AuditLog } from './audit/index.js';
import { createApiEventBus, type ApiEventBus } from './events.js';
import { registerErrorHandling } from './errors/error-handler.js';
import { registerOpenapi } from './plugins/openapi.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerV1Routes } from './routes/v1/index.js';
import type { ApiServices } from './services.js';

/** Default request body cap (1 MiB) — bounds memory and abuse; override per deployment profile. */
const DEFAULT_BODY_LIMIT = 1_000_000;

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
  const fastifyOptions: FastifyServerOptions =
    options.loggerInstance !== undefined
      ? {
          loggerInstance: options.loggerInstance,
          bodyLimit: options.bodyLimit ?? DEFAULT_BODY_LIMIT,
        }
      : { logger: options.logger ?? false, bodyLimit: options.bodyLimit ?? DEFAULT_BODY_LIMIT };
  const app = Fastify(fastifyOptions).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  registerErrorHandling(app);

  app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) {
        cb(null, true);
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
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
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
