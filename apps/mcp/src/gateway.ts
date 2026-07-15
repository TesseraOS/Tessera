import { ForbiddenError, RateLimitedError } from '@tessera/core';
// Type-only: the MCP runtime must not pull Fastify (the F-012 invariant). We reuse the F-025 auth
// MODEL (identity + permissions) but construct providers at the composition root, not here.
import type { AuthContext, AuthInput, AuthProvider, Permission } from '@tessera/api';
import type { QuotaLimiter } from './quota.js';

/**
 * The MCP gateway (FR-36): it brokers multiple clients by authenticating each call into an
 * {@link AuthContext} (reusing the F-025 `AuthProvider`), authorizing the tool against the caller's
 * RBAC permissions, and metering per-principal {@link QuotaLimiter quotas}. It is transport-agnostic:
 * the credential is read from the MCP request via {@link CredentialResolver} (default: the SDK
 * `authInfo` / `Authorization` header), so it works over stdio (one identity) or a future
 * multi-client HTTP transport.
 */

/** The tools the gateway guards, each mapped to the permission it requires (RBAC, reuse F-025 catalog). */
export type McpToolName =
  | 'search'
  | 'compile_context'
  | 'get_effects'
  | 'query_graph'
  | 'capture_memory'
  | 'explain'
  | 'assert_effect'
  | 'add_source'
  | 'list_sources'
  | 'scan_source'
  | 'list_tokens'
  | 'issue_token'
  | 'revoke_token';

export const TOOL_PERMISSIONS: Readonly<Record<McpToolName, Permission>> = {
  search: 'search:read',
  compile_context: 'compile:read',
  explain: 'compile:read',
  get_effects: 'effects:read',
  query_graph: 'effects:read',
  capture_memory: 'memory:write',
  assert_effect: 'effects:write',
  add_source: 'sources:manage',
  list_sources: 'sources:read',
  scan_source: 'sources:manage',
  list_tokens: 'admin:manage',
  issue_token: 'admin:manage',
  revoke_token: 'admin:manage',
};

/**
 * The subset of the MCP SDK's per-request `extra` the gateway reads to find a credential. Structural,
 * so the SDK's `RequestHandlerExtra` is assignable to it.
 */
export interface McpCallContext {
  /** SDK auth info populated by an HTTP transport's auth middleware (a Bearer token). */
  readonly authInfo?: { readonly token?: string } | undefined;
  /** Raw request info (headers) when the transport carries them. */
  readonly requestInfo?:
    { readonly headers?: Record<string, string | string[] | undefined> | undefined } | undefined;
}

/** Extract the auth credential from an MCP request context. */
export type CredentialResolver = (context: McpCallContext) => AuthInput;

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Default: a Bearer token from the SDK `authInfo`, else the `Authorization` header. */
export const defaultCredentialResolver: CredentialResolver = (context) => {
  const headers = context.requestInfo?.headers ?? {};
  const token = context.authInfo?.token;
  const authorization =
    token !== undefined ? `Bearer ${token}` : firstHeader(headers.authorization);
  return { authorization, headers };
};

export interface McpGatewayOptions {
  /** Authenticates a resolved credential into an {@link AuthContext} (F-025). Required. */
  readonly auth: AuthProvider;
  /** Optional per-principal quota; omitted → unmetered. */
  readonly quota?: QuotaLimiter;
  /** Optional credential extractor (default {@link defaultCredentialResolver}). */
  readonly resolveCredential?: CredentialResolver;
}

export interface McpGateway {
  /**
   * Authenticate → authorize (`tool`'s required permission) → meter the caller. Throws
   * `UnauthorizedError` (bad/missing credential), `ForbiddenError` (missing permission), or
   * `RateLimitedError` (quota exceeded); the tool wrapper maps these to the masked envelope. Returns
   * the resolved {@link AuthContext} on success.
   */
  guard(tool: McpToolName, context: McpCallContext): Promise<AuthContext>;
}

export function createMcpGateway(options: McpGatewayOptions): McpGateway {
  const resolveCredential = options.resolveCredential ?? defaultCredentialResolver;
  return {
    async guard(tool, context) {
      const authContext = await options.auth.authenticate(resolveCredential(context));
      const permission = TOOL_PERMISSIONS[tool];
      if (!authContext.permissions.has(permission)) {
        throw new ForbiddenError(`Missing required permission: ${permission}.`);
      }
      if (options.quota !== undefined) {
        const decision = options.quota.consume(authContext.principal.id);
        if (!decision.allowed) {
          throw new RateLimitedError('Quota exceeded; retry after the window resets.', {
            details: { limit: decision.limit, resetAt: decision.resetAt },
          });
        }
      }
      return authContext;
    },
  };
}
