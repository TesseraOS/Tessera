import { ForbiddenError, UnauthorizedError } from '@tessera/core';
import type { FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import type { ZodFastify } from '../app-types.js';
import { hasPermission, type AuthContext, type Permission } from './model.js';
import type { AuthProvider } from './provider.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** The identity/tenant/permissions resolved by the auth hook. `null` on public routes. */
    authContext?: AuthContext | null;
  }
  interface FastifyContextConfig {
    /** Mark a route as public — the auth hook skips it (e.g. the OpenAPI document). */
    public?: boolean;
  }
}

/**
 * Install request authentication on a route group. Adds `request.authContext` and an `onRequest`
 * hook that resolves it via the {@link AuthProvider} for every non-`public` route. A provider that
 * requires (and rejects) credentials throws {@link UnauthorizedError}, which the error handler maps
 * to a 401 envelope. Authorization is per-route via {@link requirePermission}.
 */
export function registerAuth(app: ZodFastify, provider: AuthProvider): void {
  app.decorateRequest('authContext', null);
  app.addHook('onRequest', async (request) => {
    if (request.routeOptions.config?.public === true) {
      return;
    }
    request.authContext = await provider.authenticate({
      authorization: request.headers.authorization,
      headers: request.headers,
    });
  });
}

/**
 * A `preHandler` guard that requires `permission` on `request.authContext` (RBAC, FR-54). Missing
 * context → 401 (defensive; the auth hook normally throws first); insufficient permission → 403.
 * Both surface through the standard `{error}` envelope.
 */
export function requirePermission(permission: Permission): preHandlerAsyncHookHandler {
  return function authorize(request: FastifyRequest): Promise<void> {
    const context = request.authContext;
    if (context === undefined || context === null) {
      throw new UnauthorizedError('Authentication required.');
    }
    if (!hasPermission(context, permission)) {
      throw new ForbiddenError(`Missing required permission: ${permission}.`);
    }
    return Promise.resolve();
  };
}
