import { UnauthorizedError } from '@tessera/core';
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import {
  buildAuthContext,
  DEFAULT_TENANT_ID,
  ROLES,
  type AuthContext,
  type Principal,
  type Role,
  type TenantId,
} from './model.js';
import { parseBearer, type AuthInput, type AuthProvider } from './provider.js';

/**
 * IdP-agnostic **OIDC** {@link AuthProvider} (NFR-2, F-036). It verifies a Bearer JWT (access/ID token)
 * against the identity provider's **JWKS**, checks issuer/audience/expiry, and maps standard claims to a
 * {@link Principal}. Works with any conformant OIDC IdP (Keycloak, Auth0, Entra, …) — the operator
 * points it at their issuer; no IdP-specific SDK. Uses `jose` (focused, zero-dep) for verification, so
 * it stays Fastify-free (safe to build from `@tessera/config`/the MCP process). A live end-to-end IdP
 * check is a documented seam; the verification + claim mapping are offline-unit-tested (ADR-0032).
 */

export interface OidcAuthOptions {
  /** Expected token issuer (`iss`), e.g. `https://idp.example.com/realms/tessera`. */
  readonly issuer: string;
  /** Expected audience (`aud`) — the API's client/audience id. */
  readonly audience: string;
  /** JWKS URL; defaults to `${issuer}/.well-known/jwks.json`. */
  readonly jwksUri?: string;
  /** Claim carrying roles (array or space-delimited string). Default `roles`. */
  readonly rolesClaim?: string;
  /** Claim carrying the tenant/org id. Default `tenant_id`. */
  readonly tenantClaim?: string;
  /** Role assigned when the token carries none the catalog recognizes. Default `viewer`. */
  readonly defaultRole?: Role;
  /** Clock skew tolerance in seconds. */
  readonly clockToleranceSec?: number;
  /**
   * Key resolver override — inject a local JWKS in tests to avoid network. Defaults to a cached remote
   * JWKS fetched from {@link OidcAuthOptions.jwksUri}.
   */
  readonly keySet?: JWTVerifyGetKey;
}

const ROLE_SET = new Set<string>(ROLES);

/** Coerce a roles claim (string[] | space/comma-delimited string) to catalog {@link Role}s. */
function extractRoles(claim: unknown, fallback: Role): Role[] {
  const candidates: string[] = Array.isArray(claim)
    ? claim.map((v) => String(v))
    : typeof claim === 'string'
      ? claim.split(/[\s,]+/)
      : [];
  const roles = candidates.filter((c): c is Role => ROLE_SET.has(c));
  return roles.length > 0 ? roles : [fallback];
}

function stringClaim(payload: JWTPayload, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function createOidcAuthProvider(options: OidcAuthOptions): AuthProvider {
  const jwksUri = options.jwksUri ?? `${options.issuer.replace(/\/+$/, '')}/.well-known/jwks.json`;
  const keySet = options.keySet ?? createRemoteJWKSet(new URL(jwksUri));
  const rolesClaim = options.rolesClaim ?? 'roles';
  const tenantClaim = options.tenantClaim ?? 'tenant_id';
  const defaultRole = options.defaultRole ?? 'viewer';

  return {
    async authenticate(input: AuthInput): Promise<AuthContext> {
      const token = parseBearer(input.authorization);
      if (token === undefined) {
        throw new UnauthorizedError('Missing bearer token.');
      }

      let payload: JWTPayload;
      try {
        ({ payload } = await jwtVerify(token, keySet, {
          issuer: options.issuer,
          audience: options.audience,
          ...(options.clockToleranceSec !== undefined
            ? { clockTolerance: options.clockToleranceSec }
            : {}),
        }));
      } catch {
        // Never leak the underlying reason (expired / bad signature / wrong aud) to the caller.
        throw new UnauthorizedError('Invalid or expired token.');
      }

      const subject = stringClaim(payload, 'sub');
      if (subject === undefined) {
        throw new UnauthorizedError('Token has no subject.');
      }

      const displayName = stringClaim(payload, 'name') ?? stringClaim(payload, 'email');
      const tenantId: TenantId = stringClaim(payload, tenantClaim) ?? DEFAULT_TENANT_ID;
      const principal: Principal = {
        id: subject,
        kind: 'user',
        roles: extractRoles(payload[rolesClaim], defaultRole),
        ...(displayName !== undefined ? { displayName } : {}),
      };
      return buildAuthContext(principal, tenantId);
    },
  };
}
