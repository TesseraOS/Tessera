/**
 * Auth surface for `@tessera/api` — tenancy + RBAC + scoped tokens (F-025; FR-52/FR-54/NFR-2).
 * The composition root injects an {@link AuthProvider} into `buildServer` (default: the zero-auth
 * Local provider). See ADR-0028 for the design and the OIDC / data-plane-isolation seams.
 *
 * This is the **full** auth barrel (the Fastify-free {@link ./core} + the Fastify enforcement plugin).
 * Non-HTTP consumers should import the Fastify-free `@tessera/api/auth` subpath ({@link ./core}) instead.
 */
export * from './core.js';
export { registerAuth, requirePermission } from './plugin.js';
