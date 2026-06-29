/**
 * @tessera/api — the versioned REST surface over the Tessera engine (ARCHITECTURE §11; FR-37,
 * NFR-1/6/11).
 *
 * `buildServer(services)` assembles a Fastify app whose `/v1` routes wrap the F-007…F-010 domain
 * services (search / compile / effects / memory): Zod validation at the boundary, OpenAPI
 * generated from the same schemas (`GET /v1/openapi.json`), a consistent error envelope, and
 * `/health` + `/ready`. Services are injected (the composition seam F-015 fills with a deployment
 * profile); MCP (F-012) wraps the same services — one engine, two surfaces.
 */
export { buildServer, startServer } from './server.js';
export type { BuildServerOptions, ListenOptions } from './server.js';
export type { ApiServices, ReadinessCheck, ReadinessReport } from './services.js';
export { API_VERSION } from './plugins/openapi.js';

export type { ErrorEnvelope } from './errors/envelope.js';
export { codeForStatus, envelope, statusForCode } from './errors/envelope.js';
export { mapError, type MappedError } from './errors/error-handler.js';

export * from './schemas/common.js';
export * from './schemas/search.js';
export * from './schemas/compile.js';
export * from './schemas/effects.js';
export * from './schemas/memory.js';
