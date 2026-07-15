import type { ZodFastify } from '../../app-types.js';
import { PERMISSIONS, ROLES, ROLE_PERMISSIONS } from '../../auth/index.js';
import { rbacCatalogResponseSchema } from '../../schemas/rbac.js';

/**
 * `GET /v1/rbac` — the RBAC catalog (F-046). Authenticated (in the `/v1` scope) but needs no special
 * permission; static data. Lets the dashboard derive roles/permissions from the API instead of
 * hand-mirroring the `@tessera/api` catalog.
 */
export function registerRbacRoutes(app: ZodFastify): void {
  app.get(
    '/rbac',
    {
      schema: {
        tags: ['auth'],
        summary: 'The RBAC catalog: roles, permissions, and role → permissions.',
        response: { 200: rbacCatalogResponseSchema },
      },
    },
    () => ({
      roles: [...ROLES],
      permissions: [...PERMISSIONS],
      rolePermissions: Object.fromEntries(
        ROLES.map((role) => [role, [...ROLE_PERMISSIONS[role]]]),
      ) as Record<(typeof ROLES)[number], (typeof PERMISSIONS)[number][]>,
    }),
  );
}
