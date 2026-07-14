import { UnauthorizedError } from '@tessera/core';
import type { ZodFastify } from '../../app-types.js';
import { meResponseSchema } from '../../schemas/identity.js';

/**
 * `GET /v1/me` — the caller's resolved identity, tenant, and effective permissions (F-045). Lives in
 * the `/v1` auth scope, so the `onRequest` auth hook resolves `request.authContext` first (and, under
 * a non-none provider, 401s a request with no/invalid credentials). No permission is required — a
 * principal may always see itself. In zero-auth Local mode this returns the full-access local
 * principal, which the dashboard uses to render "Local mode" and skip the sign-in screen.
 */
export function registerMeRoutes(app: ZodFastify): void {
  app.get(
    '/me',
    {
      schema: {
        tags: ['auth'],
        summary: 'The resolved identity, tenant, and effective permissions for the caller.',
        response: { 200: meResponseSchema },
      },
    },
    (request) => {
      const context = request.authContext;
      if (context === undefined || context === null) {
        // Defensive: the auth hook normally throws first under a credential-requiring provider.
        throw new UnauthorizedError('Authentication required.');
      }
      const { principal, tenantId, permissions } = context;
      return {
        principal: {
          id: principal.id,
          kind: principal.kind,
          roles: [...principal.roles],
          ...(principal.displayName !== undefined ? { displayName: principal.displayName } : {}),
        },
        tenantId,
        permissions: [...permissions],
      };
    },
  );
}
