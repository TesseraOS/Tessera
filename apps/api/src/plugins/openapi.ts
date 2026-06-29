import fastifySwagger from '@fastify/swagger';
import type { FastifyInstance } from 'fastify';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

/** API version segment all data routes live under (NFR-11: versioned, additive). */
export const API_VERSION = 'v1';

/**
 * Register OpenAPI generation. `@fastify/swagger` collects every route's Zod schema (converted by
 * `jsonSchemaTransform`) into one document, served at `GET /v1/openapi.json`. Must be registered
 * **before** the routes so its `onRoute` hook captures them (ADR-0002: OpenAPI falls out of
 * schemas). Enqueued synchronously — never `await app.register`, which would boot the app early.
 */
export function registerOpenapi(app: FastifyInstance): void {
  app.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Tessera API',
        version: '0.0.0',
        description:
          'Context & Memory OS for AI coding agents — search, compile_context, get_effects, and versioned memory.',
      },
      servers: [{ url: '/' }],
      tags: [
        { name: 'search', description: 'Hybrid retrieval.' },
        { name: 'compile', description: 'Context compilation.' },
        { name: 'effects', description: 'Knowledge-graph effect-links.' },
        { name: 'memory', description: 'Versioned memory.' },
        { name: 'ops', description: 'Operational endpoints.' },
      ],
    },
    transform: jsonSchemaTransform,
  });
}
