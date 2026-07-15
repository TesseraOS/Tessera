import { ConflictError, ForbiddenError, NotFoundError } from '@tessera/core';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ZodFastify } from '../../app-types.js';
import {
  isExpired,
  isRevoked,
  permissionsForRoles,
  requirePermission,
  tenantOf,
  type ApiTokenRecord,
  type Permission,
  type TokenStore,
} from '../../auth/index.js';
import {
  createTokenBodySchema,
  createTokenResponseSchema,
  revokeTokenResponseSchema,
  tokenListResponseSchema,
  type CreateTokenBody,
  type TokenRecord,
} from '../../schemas/tokens.js';

/** Project a stored record to the wire: no secret, no tenant; `active` derived. */
function toWireToken(record: ApiTokenRecord, at: Date): TokenRecord {
  return {
    id: record.id,
    principalId: record.principalId,
    ...(record.displayName !== undefined ? { displayName: record.displayName } : {}),
    roles: [...record.roles],
    ...(record.scopes !== undefined ? { scopes: [...record.scopes] } : {}),
    createdAt: record.createdAt,
    revokedAt: record.revokedAt ?? null,
    expiresAt: record.expiresAt ?? null,
    active: !isRevoked(record) && !isExpired(record, at),
  };
}

/** The effective permissions a would-be token grants: its roles' permissions, capped by its scopes. */
function requestedPermissions(body: CreateTokenBody): Set<Permission> {
  const fromRoles = permissionsForRoles(body.roles);
  if (body.scopes === undefined) return fromRoles;
  const scoped = new Set(body.scopes);
  return new Set([...fromRoles].filter((permission) => scoped.has(permission)));
}

/**
 * `/v1/tokens` — API-token self-service (F-046; ADR-0036 parity with the MCP token tools). All routes
 * require `admin:manage` and are audited. Backed by the injected {@link TokenStore}; when none is wired
 * (zero-auth Local — there is no token store) they answer a clean `409` rather than crash. Create
 * enforces least privilege: a caller can never mint a token more powerful than itself, and the secret
 * is returned exactly once.
 */
export function registerTokenRoutes(app: ZodFastify, tokenStore: TokenStore | undefined): void {
  const scoped = app.withTypeProvider<ZodTypeProvider>();

  function requireStore(): TokenStore {
    if (tokenStore === undefined) {
      throw new ConflictError(
        'token management requires token auth mode (no token store is configured)',
      );
    }
    return tokenStore;
  }

  scoped.get(
    '/tokens',
    {
      preHandler: requirePermission('admin:manage'),
      schema: {
        tags: ['auth'],
        summary: "List the calling tenant's API tokens (no secrets).",
        response: { 200: tokenListResponseSchema },
      },
      config: { audit: 'token.read' },
    },
    async (request) => {
      const store = requireStore();
      const now = new Date();
      const records = await store.list(tenantOf(request));
      return { tokens: records.map((record) => toWireToken(record, now)) };
    },
  );

  scoped.post<{ Body: CreateTokenBody }>(
    '/tokens',
    {
      preHandler: requirePermission('admin:manage'),
      schema: {
        tags: ['auth'],
        summary: 'Issue a scoped API token (the secret is returned once).',
        body: createTokenBodySchema,
        response: { 201: createTokenResponseSchema },
      },
      config: { audit: 'token.manage' },
    },
    async (request, reply) => {
      const store = requireStore();
      const context = request.authContext;
      // Least privilege: the new token must not exceed the caller's effective permissions.
      const requested = requestedPermissions(request.body);
      const callerPermissions = context?.permissions ?? new Set<Permission>();
      for (const permission of requested) {
        if (!callerPermissions.has(permission)) {
          throw new ForbiddenError('cannot issue a token exceeding your own permissions');
        }
      }
      const { token, record } = await store.issue({
        tenantId: tenantOf(request),
        principalId: request.body.principalId,
        roles: request.body.roles,
        ...(request.body.displayName !== undefined
          ? { displayName: request.body.displayName }
          : {}),
        ...(request.body.scopes !== undefined ? { scopes: request.body.scopes } : {}),
        ...(request.body.expiresAt !== undefined ? { expiresAt: request.body.expiresAt } : {}),
      });
      return reply.status(201).send({ token: toWireToken(record, new Date()), secret: token });
    },
  );

  scoped.delete<{ Params: { id: string } }>(
    '/tokens/:id',
    {
      preHandler: requirePermission('admin:manage'),
      schema: {
        tags: ['auth'],
        summary: 'Revoke an API token by id.',
        response: { 200: revokeTokenResponseSchema },
      },
      config: { audit: 'token.manage' },
    },
    async (request) => {
      const store = requireStore();
      const { id } = request.params;
      // Tenant-scope the revoke: only tokens in the caller's tenant are visible/revocable.
      const owned = (await store.list(tenantOf(request))).some((record) => record.id === id);
      if (!owned) {
        throw new NotFoundError(`token not found: ${id}`);
      }
      await store.revoke(id);
      return { id, revoked: true as const };
    },
  );
}
