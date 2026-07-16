import { buildServer } from '@tessera/api';
import type { Runtime } from '@tessera/config';
import { annotateRequestId, instrumentServices, type Observability } from '@tessera/observability';
import { createServerRuntime, type ServerRuntimeOptions } from './bootstrap.js';

type ApiApp = ReturnType<typeof buildServer>;

export interface ApiServerOptions extends ServerRuntimeOptions {
  readonly host?: string;
  readonly port?: number;
  /** Enable Fastify's default logger (ignored when `observability` supplies one). */
  readonly logger?: boolean;
  /**
   * When provided, domain calls are traced + timed (API → service) and its Pino logger backs the
   * server, and request latency is recorded. Omit it (tests) for a plain, quiet server.
   */
  readonly observability?: Observability;
}

export interface ApiServerHandle {
  readonly runtime: Runtime;
  readonly app: ApiApp;
  /** The bound address, e.g. `http://127.0.0.1:3000`. */
  readonly url: string;
  /** Stop serving and release the runtime's handles. */
  close(): Promise<void>;
}

/**
 * Boot the Local profile and serve the REST `/v1` API (F-011). With `observability`, services are
 * instrumented (F-016) and an `onResponse` hook records HTTP latency. Returns a handle whose
 * `close()` stops the server then closes the runtime (graceful shutdown).
 */
export async function startApiServer(options: ApiServerOptions = {}): Promise<ApiServerHandle> {
  const runtime = await createServerRuntime(options);
  const obs = options.observability;
  const services = obs === undefined ? runtime.services : instrumentServices(runtime.services, obs);

  const api = runtime.config.api;
  const app = buildServer(services, {
    // Guard /v1 with the runtime's configured provider (F-034; default = zero-auth Local).
    auth: runtime.auth.provider,
    // Share the runtime's event bus so the ingestion worker's scan events reach SSE clients (F-038).
    events: runtime.events,
    // Record the audit trail into the runtime's persistent sink when enabled (F-027; else in-memory).
    ...(runtime.audit !== undefined ? { audit: runtime.audit } : {}),
    // Back /v1/tokens self-service with the runtime's token store (F-046; present in token mode).
    ...(runtime.auth.tokenStore !== undefined ? { tokenStore: runtime.auth.tokenStore } : {}),
    // The effective memory retention policy backing /v1/retention (F-047); empty ⇒ retention off.
    memoryRetention: runtime.memoryRetention,
    // API hardening from config (F-044): security headers/HSTS, per-profile CORS, rate limiting.
    security: { hsts: api.security.hsts },
    cors: { allowedOrigins: api.cors.allowedOrigins },
    rateLimit: {
      enabled: api.rateLimit.enabled,
      limit: api.rateLimit.limit,
      windowMs: api.rateLimit.windowMs,
    },
    ...(obs !== undefined ? { loggerInstance: obs.logger } : { logger: options.logger ?? false }),
  });

  if (obs !== undefined) {
    // Thread the request/correlation id onto the active span (F-044); no-op if telemetry is off.
    app.addHook('onRequest', (request, _reply, done) => {
      annotateRequestId(request.id);
      done();
    });
    app.addHook('onResponse', (request, reply, done) => {
      obs.instruments.httpServerDuration.record(reply.elapsedTime, {
        method: request.method,
        route: request.routeOptions.url ?? request.url,
        status: reply.statusCode,
      });
      done();
    });
  }

  const host = options.host ?? process.env.HOST ?? '127.0.0.1';
  const port = options.port ?? Number(process.env.PORT ?? 3000);
  const url = await app.listen({ host, port });

  return {
    runtime,
    app,
    url,
    async close() {
      await app.close();
      await runtime.close();
    },
  };
}
