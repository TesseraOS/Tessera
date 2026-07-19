/**
 * Enumerate a tenant's projects for **tenant-wide** operations (FR-66, ADR-0037). With projects, a bare
 * `forTenant(t)` view is scoped to the tenant's *default* project — so an operation that must cover
 * everything the tenant owns (DSR export/erasure per NFR-13, retention) has to iterate every project and
 * scope each with `.forProject(id)`. This returns the reserved default first, then the stored projects.
 */
import { DEFAULT_PROJECT_ID, type ProjectId, type TenantId } from '@tessera/core';
import type { ProjectService } from './service.js';

/**
 * Every project id for a tenant (the reserved default first). When no project service is wired only the
 * default project exists, so the caller still behaves exactly as it did before projects.
 */
export async function tenantProjectIds(
  projects: ProjectService | undefined,
  tenantId: TenantId,
): Promise<readonly ProjectId[]> {
  if (projects === undefined) return [DEFAULT_PROJECT_ID];
  // `list` already yields the default project first, then stored projects oldest-first.
  return (await projects.list(tenantId)).map((project) => project.id);
}
