import { UnauthorizedError } from '@tessera/core';
import {
  buildAuthContext,
  createLocalAuthContext,
  DEFAULT_TENANT_ID,
  type AuthContext,
  type Principal,
  type TenantId,
} from './model.js';
import type { TokenStore } from './token-store.js';

/**
 * `AuthProvider` — the pluggable authentication port (ARCHITECTURE §6, `AuthProvider` in
 * `@tessera/api`). It turns an incoming request's credentials into an {@link AuthContext} or throws
 * {@link UnauthorizedError} (→ 401). The Local profile uses {@link createLocalAuthProvider} (no
 * credential required); hosted/self-host inject {@link createTokenAuthProvider} or an OIDC adapter
 * (a documented seam — OIDC is "just another provider"; the concrete library is an open ADR-0028).
 */

/** The request material a provider authenticates from. */
export interface AuthInput {
  /** The `Authorization` header value, if any. */
  readonly authorization?: string | undefined;
  /** All request headers (for providers that read cookies, api-key headers, etc.). */
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
}

export interface AuthProvider {
  authenticate(input: AuthInput): Promise<AuthContext>;
}

/** Extract the token from a `Bearer <token>` header, or `undefined` if absent/malformed. */
export function parseBearer(authorization: string | undefined): string | undefined {
  if (authorization === undefined) {
    return undefined;
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1]?.trim() || undefined;
}

/**
 * The **none/local** provider: every request resolves to a full-access {@link createLocalAuthContext}
 * in the default tenant, regardless of credentials. This preserves Tessera's zero-auth local
 * behavior — it is the `buildServer` default, so existing routes/clients are unaffected.
 */
export function createLocalAuthProvider(options: { tenantId?: TenantId } = {}): AuthProvider {
  const context = createLocalAuthContext(options.tenantId ?? DEFAULT_TENANT_ID);
  return { authenticate: () => Promise.resolve(context) };
}

/**
 * The **token** provider: requires a valid `Bearer` token resolved by the {@link TokenStore}. A
 * missing or invalid/revoked token throws {@link UnauthorizedError} (→ 401). The resolved principal
 * carries the token's roles + scopes, so RBAC (least privilege) applies downstream.
 */
export function createTokenAuthProvider(deps: { tokenStore: TokenStore }): AuthProvider {
  return {
    async authenticate(input) {
      const secret = parseBearer(input.authorization);
      if (secret === undefined) {
        throw new UnauthorizedError('Missing bearer token.');
      }
      const record = await deps.tokenStore.verify(secret);
      if (record === null) {
        throw new UnauthorizedError('Invalid or revoked token.');
      }
      const principal: Principal = {
        id: record.principalId,
        kind: 'token',
        roles: record.roles,
        ...(record.displayName !== undefined ? { displayName: record.displayName } : {}),
        ...(record.scopes !== undefined ? { scopes: record.scopes } : {}),
      };
      return buildAuthContext(principal, record.tenantId);
    },
  };
}
