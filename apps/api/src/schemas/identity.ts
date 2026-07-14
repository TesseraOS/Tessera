import { z } from 'zod/v4';
import { PERMISSIONS, ROLES } from '../auth/model.js';

/** Whether the caller is the zero-auth local stand-in, an authenticated user, or an API token. */
export const principalKindSchema = z.enum(['local', 'user', 'token']);

/**
 * `GET /v1/me` response — the resolved identity for the caller (F-045; backs the dashboard's account
 * control + token validation + auth-mode discovery). It is a projection of the request's
 * `AuthContext`: the principal (never any secret), its tenant, and its effective permissions (so the
 * UI can gate admin-only surfaces). In zero-auth Local mode this is the full-access local principal.
 */
export const meResponseSchema = z.object({
  principal: z.object({
    id: z.string(),
    kind: principalKindSchema,
    displayName: z.string().optional(),
    roles: z.array(z.enum(ROLES)),
  }),
  tenantId: z.string(),
  permissions: z.array(z.enum(PERMISSIONS)),
});

export type MeResponse = z.infer<typeof meResponseSchema>;
