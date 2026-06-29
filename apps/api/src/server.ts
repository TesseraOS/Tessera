import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { ZodFastify } from './app-types.js';
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
 * here — `inject`/`listen` boot the plugin queue in order. Auth/CORS/rate-limit (per profile) and
 * adapter wiring are F-015/F-025; this function is pure given its services.
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

  // Must precede route registration so the OpenAPI collector sees every route.
  registerOpenapi(app);

  app.register((instance, _opts, done) => {
    registerHealthRoutes(instance.withTypeProvider<ZodTypeProvider>(), services);
    done();
  });

  registerV1Routes(app, services);

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
