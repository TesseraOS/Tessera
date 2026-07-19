/**
 * Project domain model (FR-66; ADR-0037). A project is a first-class scope **under** the tenant: it
 * owns a disjoint slice of the data plane (sources, indices, memory, graph, compile cache), so one org
 * can keep several codebases' context apart. Pure data — no I/O, no Fastify.
 *
 * The reserved {@link DEFAULT_PROJECT_ID} project is **implicit**: it always exists, is never stored,
 * and cannot be renamed or deleted. It is the scope every existing single-project deployment already
 * operates in (ADR-0033/0037), so introducing projects changes nothing until a second one is created.
 */
import { DEFAULT_PROJECT_ID, type ProjectId, type TenantId } from '@tessera/core';

/** A project within a tenant. `id` is the opaque scope key threaded through the data plane. */
export interface Project {
  readonly id: ProjectId;
  readonly tenantId: TenantId;
  /** Human-readable name shown in the switcher. */
  readonly name: string;
  /** ISO-8601 (UTC) creation time. The reserved default project reports the epoch. */
  readonly createdAt: string;
  /** True for the reserved {@link DEFAULT_PROJECT_ID} project — implicit, undeletable, unrenamable. */
  readonly isDefault: boolean;
}

/** Display name of the reserved default project. */
export const DEFAULT_PROJECT_NAME = 'Default';

/** Max length of a project name (kept modest — it rides the app-shell switcher). */
export const MAX_PROJECT_NAME_LENGTH = 100;

/** The synthesized reserved default project for a tenant (never persisted). */
export function defaultProjectFor(tenantId: TenantId): Project {
  return {
    id: DEFAULT_PROJECT_ID,
    tenantId,
    name: DEFAULT_PROJECT_NAME,
    createdAt: new Date(0).toISOString(),
    isDefault: true,
  };
}

/** Whether `id` names the reserved default project. */
export function isDefaultProject(id: ProjectId): boolean {
  return id === DEFAULT_PROJECT_ID;
}
