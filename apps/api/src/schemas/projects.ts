import { z } from 'zod/v4';
import { MAX_PROJECT_NAME_LENGTH } from '../projects/model.js';

/**
 * Multi-project workspaces (F-066; ADR-0037). A project is a scope under the tenant; `/v1/projects`
 * manages them. The `tenantId` stays **off the wire** (a server-side scope, like everywhere else); the
 * project `id` is the value a client sends in the `X-Tessera-Project` header to scope a request.
 */

/** A project projected to the wire. `isDefault` marks the reserved, undeletable default project. */
export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  isDefault: z.boolean(),
});

/** `GET /v1/projects` — the tenant's projects (default first, then stored oldest-first). */
export const projectListResponseSchema = z.object({
  projects: z.array(projectSchema),
});

/** `POST /v1/projects` body — create a project. */
export const createProjectBodySchema = z.object({
  name: z.string().trim().min(1).max(MAX_PROJECT_NAME_LENGTH),
});

/** `PATCH /v1/projects/:id` body — rename a project. */
export const renameProjectBodySchema = z.object({
  name: z.string().trim().min(1).max(MAX_PROJECT_NAME_LENGTH),
});

/** `DELETE /v1/projects/:id` response. */
export const deleteProjectResponseSchema = z.object({
  id: z.string(),
  deleted: z.literal(true),
});

/** `:id` path parameter for the single-project routes. */
export const projectIdParamSchema = z.object({
  id: z.string().min(1),
});

export type ProjectWire = z.infer<typeof projectSchema>;
export type CreateProjectBody = z.infer<typeof createProjectBodySchema>;
export type RenameProjectBody = z.infer<typeof renameProjectBodySchema>;
export type ProjectIdParam = z.infer<typeof projectIdParamSchema>;
