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
          'Context & Memory OS for AI coding agents — search, compile_context, get_effects, and versioned memory.\n\n' +
          '**Project scope (multi-project workspaces, ADR-0037):** send the `X-Tessera-Project` header ' +
          'with a project id (from `GET /v1/projects`) to scope a request — its search, compile, effects, ' +
          'graph, memory, and sources — to that project. Omit it (or send `default`) for the reserved ' +
          'default project. An unknown/foreign project id is rejected with `404`.\n\n' +
          '**Remote MCP (F-055):** a deployment may additionally expose the Model Context Protocol ' +
          'over streamable HTTP on this same listener (default path `/mcp`, methods POST/GET/DELETE, ' +
          'Bearer-authenticated). It is JSON-RPC rather than REST, so it is deliberately **not** ' +
          'described in this document and no generated SDK method exists for it — see the remote-MCP ' +
          'setup page in the docs.',
      },
      servers: [{ url: '/' }],
      tags: [
        { name: 'search', description: 'Hybrid retrieval.' },
        { name: 'compile', description: 'Context compilation.' },
        { name: 'effects', description: 'Knowledge-graph effect-links.' },
        { name: 'memory', description: 'Versioned memory.' },
        { name: 'projects', description: 'Multi-project workspaces (X-Tessera-Project scope).' },
        { name: 'ops', description: 'Operational endpoints.' },
      ],
    },
    transform: jsonSchemaTransform,
  });
}
