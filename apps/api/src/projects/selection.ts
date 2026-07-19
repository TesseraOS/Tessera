/**
 * Request-time project selection (FR-66, ADR-0037). A client scopes a request to a project with the
 * **`X-Tessera-Project`** header — the one documented selection mechanism; omitted (or `default`) means
 * the reserved default project, so every existing single-project client is unchanged. The chosen id is
 * **validated against the caller's tenant on every request** (a foreign/unknown project id is rejected,
 * never silently scoped to — no cross-tenant reference). Data routes then thread
 * `service.forTenant(tenantOf(request)).forProject(projectOf(request))`.
 */
import { DEFAULT_PROJECT_ID, NotFoundError, type ProjectId } from '@tessera/core';
import type { FastifyRequest } from 'fastify';
import type { ZodFastify } from '../app-types.js';
import { tenantOf } from '../auth/index.js';
import type { ApiServices } from '../services.js';

/** The header a client sends to scope a request to a project (lowercased — Node header keys are). */
export const PROJECT_HEADER = 'x-tessera-project';

declare module 'fastify' {
  interface FastifyRequest {
    /** The validated project this request is scoped to (default project until the hook resolves it). */
    projectId?: ProjectId;
  }
}

/**
 * The project a request is scoped to (FR-66): the validated `X-Tessera-Project` selection, or
 * {@link DEFAULT_PROJECT_ID}. Routes thread this into services via `.forProject(projectOf(request))`.
 */
export function projectOf(request: FastifyRequest): ProjectId {
  return request.projectId ?? DEFAULT_PROJECT_ID;
}

/**
 * Install project selection on the `/v1` scope. A `preHandler` reads `X-Tessera-Project`, validates a
 * non-default value against the caller's tenant (via {@link ProjectService.exists}), and decorates
 * `request.projectId`. An unknown/foreign project → 404 (`project not found`). Registered **after** auth
 * so the tenant is resolved. The project-management routes (`/v1/projects*`) are exempt: managing
 * projects is a tenant-level action, so a stale header there must never lock a user out of recovering.
 */
export function registerProjectSelection(app: ZodFastify, services: ApiServices): void {
  app.decorateRequest('projectId', DEFAULT_PROJECT_ID);
  app.addHook('preHandler', async (request) => {
    if (request.routeOptions.config?.public === true) return;

    const raw = request.headers[PROJECT_HEADER];
    const value = Array.isArray(raw) ? raw[0] : raw;
    request.projectId = DEFAULT_PROJECT_ID;
    if (value === undefined || value === '' || value === DEFAULT_PROJECT_ID) return;

    // Project management is tenant-level, not project-scoped — never reject it on a stale selection.
    if (request.routeOptions.url?.startsWith('/v1/projects')) return;

    const projects = services.projects;
    const known =
      projects !== undefined && (await projects.exists(tenantOf(request), value as ProjectId));
    if (!known) {
      throw new NotFoundError('project not found', { details: { id: value } });
    }
    request.projectId = value as ProjectId;
  });
}
