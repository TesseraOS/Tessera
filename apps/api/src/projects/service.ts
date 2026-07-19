/**
 * Project control-plane service (FR-66, ADR-0037). Wraps a {@link ProjectStore} with the domain rules:
 * the reserved default project is synthesized (never stored) and is undeletable/unrenamable; names are
 * validated + unique within a tenant; ids are opaque and generated here. Backs `/v1/projects` (REST) and
 * the MCP project tools — one service, two surfaces (ADR-0036).
 */
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  newId,
  type ProjectId,
  type TenantId,
} from '@tessera/core';
import { z } from 'zod/v4';
import {
  defaultProjectFor,
  isDefaultProject,
  MAX_PROJECT_NAME_LENGTH,
  type Project,
} from './model.js';
import type { ProjectStore } from './store.js';

const nameSchema = z
  .string()
  .trim()
  .min(1, 'project name must not be empty')
  .max(
    MAX_PROJECT_NAME_LENGTH,
    `project name must be at most ${MAX_PROJECT_NAME_LENGTH} characters`,
  );

export interface CreateProjectInput {
  readonly name: string;
}

export interface RenameProjectInput {
  readonly name: string;
}

/** The project control-plane operations REST + MCP expose. All are tenant-scoped by an explicit `tenantId`. */
export interface ProjectService {
  /** The tenant's projects: the reserved default first, then stored projects oldest-first. */
  list(tenantId: TenantId): Promise<readonly Project[]>;
  /** Fetch one project (the synthesized default, or a stored project), or `undefined`. */
  get(tenantId: TenantId, id: ProjectId): Promise<Project | undefined>;
  /** Create a project. Rejects an empty/over-long or duplicate (case-insensitive) name. */
  create(tenantId: TenantId, input: CreateProjectInput): Promise<Project>;
  /** Rename a project. Rejects the default project, a duplicate name, and an unknown id. */
  rename(tenantId: TenantId, id: ProjectId, input: RenameProjectInput): Promise<Project>;
  /** Delete a project. Rejects the default project; 404s an unknown id. */
  remove(tenantId: TenantId, id: ProjectId): Promise<void>;
  /**
   * Whether `id` is a valid project for `tenantId` — the reserved default, or a stored project. Backs
   * request-time project selection (ADR-0037): a foreign/unknown project id must be rejected, not
   * silently scoped to.
   */
  exists(tenantId: TenantId, id: ProjectId): Promise<boolean>;
}

function parseName(raw: string): string {
  const result = nameSchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError('invalid project name', { details: { issues: result.error.issues } });
  }
  return result.data;
}

/** Create a {@link ProjectService} over a {@link ProjectStore}. */
export function createProjectService(store: ProjectStore): ProjectService {
  /** Reject a name that collides (case-insensitive) with the default or an existing project. */
  async function assertNameFree(
    tenantId: TenantId,
    name: string,
    exceptId?: ProjectId,
  ): Promise<void> {
    const lowered = name.toLowerCase();
    const existing = await store.list(tenantId);
    const clash =
      lowered === defaultProjectFor(tenantId).name.toLowerCase() ||
      existing.some((project) => project.id !== exceptId && project.name.toLowerCase() === lowered);
    if (clash) {
      throw new ConflictError('a project with that name already exists', { details: { name } });
    }
  }

  return {
    async list(tenantId) {
      const stored = await store.list(tenantId);
      return [defaultProjectFor(tenantId), ...stored];
    },

    get(tenantId, id) {
      if (isDefaultProject(id)) return Promise.resolve(defaultProjectFor(tenantId));
      return store.get(tenantId, id);
    },

    async create(tenantId, input) {
      const name = parseName(input.name);
      await assertNameFree(tenantId, name);
      const project: Project = {
        id: newId<'Project'>(),
        tenantId,
        name,
        createdAt: new Date().toISOString(),
        isDefault: false,
      };
      await store.create(project);
      return project;
    },

    async rename(tenantId, id, input) {
      if (isDefaultProject(id)) {
        throw new ValidationError('the default project cannot be renamed', { details: { id } });
      }
      const name = parseName(input.name);
      await assertNameFree(tenantId, name, id);
      const updated = await store.rename(tenantId, id, name);
      if (updated === undefined) {
        throw new NotFoundError('project not found', { details: { id } });
      }
      return updated;
    },

    async remove(tenantId, id) {
      if (isDefaultProject(id)) {
        throw new ValidationError('the default project cannot be deleted', { details: { id } });
      }
      const existing = await store.get(tenantId, id);
      if (existing === undefined) {
        throw new NotFoundError('project not found', { details: { id } });
      }
      await store.remove(tenantId, id);
    },

    async exists(tenantId, id) {
      if (isDefaultProject(id)) return true;
      return (await store.get(tenantId, id)) !== undefined;
    },
  };
}
