import { ConflictError, NotFoundError } from '@tessera/core';
import type { ZodFastify } from '../../app-types.js';
import { requirePermission, tenantOf } from '../../auth/index.js';
import type { Project, ProjectService } from '../../projects/index.js';
import type { ApiServices } from '../../services.js';
import {
  createProjectBodySchema,
  deleteProjectResponseSchema,
  projectIdParamSchema,
  projectListResponseSchema,
  projectSchema,
  renameProjectBodySchema,
  type CreateProjectBody,
  type ProjectIdParam,
  type RenameProjectBody,
} from '../../schemas/projects.js';

/** The project service, or a clean 409 when the deployment did not wire one (e.g. doc generation). */
function requireProjects(services: ApiServices): ProjectService {
  if (services.projects === undefined) {
    throw new ConflictError('project management is not configured for this deployment');
  }
  return services.projects;
}

/** Project a domain project to the wire shape — `tenantId` stays off the wire (a server-side scope). */
function toWire(project: Project): {
  id: string;
  name: string;
  createdAt: string;
  isDefault: boolean;
} {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    isDefault: project.isDefault,
  };
}

/**
 * `/v1/projects` — multi-project workspace management (F-066; FR-66, ADR-0037). A project is a scope
 * under the tenant with a disjoint slice of the data plane; a request selects one via the
 * `X-Tessera-Project` header (omitted → the reserved default project). Reads require `projects:read`
 * (every authenticated user, for the switcher); create/rename/delete require `projects:manage` and are
 * audited (project lifecycle is a data-isolation boundary). This is the REST half of the ADR-0036
 * agent-first parity contract — MCP project tools wrap the same service. The reserved `default` project
 * is implicit and cannot be renamed or deleted.
 */
export function registerProjectRoutes(app: ZodFastify, services: ApiServices): void {
  app.get(
    '/projects',
    {
      preHandler: requirePermission('projects:read'),
      schema: {
        tags: ['projects'],
        summary: 'List the projects in the calling tenant (default first).',
        response: { 200: projectListResponseSchema },
      },
      config: { audit: 'project.read' },
    },
    async (request) => {
      const projects = await requireProjects(services).list(tenantOf(request));
      return { projects: projects.map(toWire) };
    },
  );

  app.post<{ Body: CreateProjectBody }>(
    '/projects',
    {
      preHandler: requirePermission('projects:manage'),
      schema: {
        tags: ['projects'],
        summary: 'Create a project (a new, isolated workspace scope).',
        body: createProjectBodySchema,
        response: { 201: projectSchema },
      },
      config: { audit: 'project.manage' },
    },
    async (request, reply) => {
      const project = await requireProjects(services).create(tenantOf(request), {
        name: request.body.name,
      });
      return reply.status(201).send(toWire(project));
    },
  );

  app.get<{ Params: ProjectIdParam }>(
    '/projects/:id',
    {
      preHandler: requirePermission('projects:read'),
      schema: {
        tags: ['projects'],
        summary: 'Get a project by id.',
        params: projectIdParamSchema,
        response: { 200: projectSchema },
      },
      config: { audit: 'project.read' },
    },
    async (request) => {
      const project = await requireProjects(services).get(tenantOf(request), request.params.id);
      if (project === undefined) {
        throw new NotFoundError('project not found', { details: { id: request.params.id } });
      }
      return toWire(project);
    },
  );

  app.patch<{ Params: ProjectIdParam; Body: RenameProjectBody }>(
    '/projects/:id',
    {
      preHandler: requirePermission('projects:manage'),
      schema: {
        tags: ['projects'],
        summary: 'Rename a project (not the reserved default).',
        params: projectIdParamSchema,
        body: renameProjectBodySchema,
        response: { 200: projectSchema },
      },
      config: { audit: 'project.manage' },
    },
    async (request) => {
      const project = await requireProjects(services).rename(tenantOf(request), request.params.id, {
        name: request.body.name,
      });
      return toWire(project);
    },
  );

  app.delete<{ Params: ProjectIdParam }>(
    '/projects/:id',
    {
      preHandler: requirePermission('projects:manage'),
      schema: {
        tags: ['projects'],
        summary: 'Delete a project (not the reserved default).',
        params: projectIdParamSchema,
        response: { 200: deleteProjectResponseSchema },
      },
      config: { audit: 'project.manage' },
    },
    async (request) => {
      const id = request.params.id;
      await requireProjects(services).remove(tenantOf(request), id);
      return { id, deleted: true as const };
    },
  );
}
