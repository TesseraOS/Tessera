import { z } from 'zod/v4';
import { PERMISSIONS, ROLES } from '../auth/model.js';

/**
 * `GET /v1/rbac` — the RBAC catalog (F-046). The dashboard **derives** its roles/permissions from
 * this endpoint instead of hand-mirroring the `@tessera/api` catalog (kills the drift flagged in the
 * 2026-07-04 review). Static data — cacheable indefinitely.
 */
export const rbacCatalogResponseSchema = z.object({
  roles: z.array(z.enum(ROLES)),
  permissions: z.array(z.enum(PERMISSIONS)),
  /** Role → the permissions it grants (mirrors ROLE_PERMISSIONS). */
  rolePermissions: z.record(z.enum(ROLES), z.array(z.enum(PERMISSIONS))),
});

export type RbacCatalogResponse = z.infer<typeof rbacCatalogResponseSchema>;
