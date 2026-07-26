import {
  createInMemoryRateLimiter,
  registerRateLimit,
  REQUEST_ID_HEADER,
  securityHeaders,
  type ApiServices,
  type SecurityHeadersOptions,
} from '@tessera/api';
import type { Runtime } from '@tessera/config';
import { createMcpHttpHandler, type McpHttpHandler } from '@tessera/mcp/http';
import { createRuntimeGateway } from './mcp-gateway.js';

/**
 * Mount remote MCP (F-055; ADR-0058) on the **same** Fastify app that serves REST, so a self-hosted
 * deployment exposes one port, one TLS certificate, one CORS policy, and one audit trail.
 *
 * The transport itself is Fastify-free (`@tessera/mcp/http`); this module is the only place the two
 * meet, and it exists to solve exactly three integration problems the transport cannot solve alone:
 * the pre-parsed body, the hijacked reply, and teardown ordering.
 */

/** The minimal Fastify surface used here — avoids re-exporting `@tessera/api`'s internal app type. */
interface McpHost {
  register(
    plugin: (scope: McpHost, options: unknown, done: () => void) => void,
    options?: unknown,
  ): void;
  route(options: {
    method: readonly string[];
    url: string;
    schema: { hide: true };
    handler: (
      request: {
        id: string;
        body?: unknown;
        raw: unknown;
      },
      reply: { hijack(): void; raw: unknown },
    ) => Promise<void>;
  }): void;
}

export interface McpHttpMount {
  /** Close every live MCP session. Must run **before** the Fastify app closes — see below. */
  close(): Promise<void>;
}

export interface RegisterMcpHttpOptions {
  readonly runtime: Runtime;
  readonly services: ApiServices;
  readonly security?: SecurityHeadersOptions;
}

export function registerMcpHttp(app: McpHost, options: RegisterMcpHttpOptions): McpHttpMount {
  const { runtime, services, security = {} } = options;
  const config = runtime.config.mcp.http;

  const handler: McpHttpHandler = createMcpHttpHandler(services, {
    // The same gateway stdio builds — auth + RBAC + quotas + audit, unchanged (ADR-0036 parity).
    gateway: createRuntimeGateway(runtime),
    sessionTtlMs: config.sessionTtlMs,
    maxSessions: config.maxSessions,
  });

  app.register((scope, _options, done) => {
    // Per-IP rate limiting for the MCP endpoint (F-044 parity). No custom key function is needed:
    // outside `/v1` there is no `request.authContext`, so the shared `rateLimitKey` falls through to
    // `ip:<ip>` — which is what an unauthenticated flood needs. The gateway's per-principal quota is
    // the complementary control for authenticated abuse. Its own limiter instance, so REST and MCP
    // do not share a bucket.
    const rateLimit = runtime.config.api.rateLimit;
    if (rateLimit.enabled) {
      registerRateLimit(scope as never, {
        limiter: createInMemoryRateLimiter({
          limit: rateLimit.limit,
          windowMs: rateLimit.windowMs,
        }),
      });
    }

    scope.route({
      method: ['GET', 'POST', 'DELETE'],
      url: config.path,
      // Hidden from the OpenAPI document on purpose (ADR-0058 §7): JSON-RPC over HTTP is not a REST
      // operation, and describing it would emit a nonsense operation into the generated SDK.
      schema: { hide: true },
      async handler(request, reply) {
        // Take ownership of the raw response: the SDK transport writes its own status line via
        // `writeHead`, so Fastify must not also try to send.
        reply.hijack();

        // A hijacked reply loses anything set through `reply.header()` — but Node merges values set
        // with `setHeader` into a later `writeHead`. So the F-044 headers are written onto the raw
        // response here, exactly as `GET /v1/events` does.
        const raw = reply.raw as {
          setHeader(name: string, value: string): void;
        };
        raw.setHeader(REQUEST_ID_HEADER, request.id);
        for (const [name, value] of Object.entries(securityHeaders(security))) {
          raw.setHeader(name, value);
        }

        // `request.body` is REQUIRED here. Fastify has already drained the request stream to parse
        // `application/json`, so without it the SDK would call `req.json()` on a consumed stream and
        // the request would hang forever. `undefined` for GET/DELETE, which carry no body.
        await handler.handle(request.raw as never, reply.raw as never, request.body);
      },
    });

    done();
  });

  return { close: () => handler.close() };
}
