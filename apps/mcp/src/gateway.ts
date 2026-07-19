import { ForbiddenError, RateLimitedError } from '@tessera/core';
// Type-only: the MCP runtime must not pull Fastify (the F-012 invariant). We reuse the F-025 auth
// MODEL (identity + permissions) and the F-027 audit MODEL, but construct providers/sinks at the
// composition root, not here.
import type {
  AuditAction,
  AuditLog,
  AuditOutcome,
  AuthContext,
  AuthInput,
  AuthProvider,
  Permission,
} from '@tessera/api';
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
  | 'get_stats'
  | 'list_projects'
  | 'create_project'
  | 'rename_project'
  | 'delete_project'
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
  get_stats: 'stats:read',
  list_projects: 'projects:read',
  create_project: 'projects:manage',
  rename_project: 'projects:manage',
  delete_project: 'projects:manage',
  list_tokens: 'admin:manage',
  issue_token: 'admin:manage',
  revoke_token: 'admin:manage',
};

/**
 * Each tool's audit action (F-047, closing the F-027 seam). Reuses the **existing** REST taxonomy — an
 * agent capturing a memory over MCP and a user capturing one over REST are the same `memory.write` in
 * one trail, so compliance reporting never has to union two vocabularies (ADR-0036 parity).
 */
export const MCP_AUDIT_ACTIONS: Readonly<Record<McpToolName, AuditAction>> = {
  search: 'search',
  compile_context: 'compile',
  explain: 'compile',
  get_effects: 'effects.read',
  query_graph: 'effects.read',
  capture_memory: 'memory.write',
  assert_effect: 'effects.write',
  add_source: 'source.manage',
  list_sources: 'source.read',
  scan_source: 'source.manage',
  // Reuses the existing read action rather than minting a `stats.read` one: the REST twin is not
  // audited at all (a per-page-load aggregate read would flood the trail), and this record must stay
  // exhaustive over McpToolName. One new vocabulary entry for a read that REST does not record would
  // make the two surfaces disagree for no compliance gain.
  get_stats: 'source.read',
  list_projects: 'project.read',
  create_project: 'project.manage',
  rename_project: 'project.manage',
  delete_project: 'project.manage',
  list_tokens: 'token.read',
  issue_token: 'token.manage',
  revoke_token: 'token.manage',
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
  /**
   * Optional audit sink (F-047, closing the F-027 seam). When set, every guarded call records the
   * **authorization decision** — `success` once the caller is authorized + metered, `denied` on a
   * permission or quota refusal — with the actor/tenant from the resolved {@link AuthContext} and the
   * tool name as the target. Unauthenticated calls are **not** recorded: without an identity there is
   * no tenant to attribute them to (the same rule the REST recorder applies to 401s).
   *
   * Recording is best-effort and failure-isolated: a sink error never fails a tool call.
   */
  readonly audit?: AuditLog;
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
  const { audit } = options;

  /** Record one decision. Best-effort: a sink failure must never turn a good tool call into an error. */
  const record = async (
    authContext: AuthContext,
    tool: McpToolName,
    outcome: AuditOutcome,
  ): Promise<void> => {
    if (audit === undefined) return;
    try {
      await audit.forTenant(authContext.tenantId).record({
        tenantId: authContext.tenantId,
        actor: { principalId: authContext.principal.id, kind: authContext.principal.kind },
        action: MCP_AUDIT_ACTIONS[tool],
        target: tool,
        outcome,
        metadata: { surface: 'mcp' },
      });
    } catch {
      // Swallowed by contract (see McpGatewayOptions.audit).
    }
  };

  return {
    async guard(tool, context) {
      // A failure here is unauthenticated — no identity, so nothing attributable to audit.
      const authContext = await options.auth.authenticate(resolveCredential(context));

      const permission = TOOL_PERMISSIONS[tool];
      if (!authContext.permissions.has(permission)) {
        await record(authContext, tool, 'denied');
        throw new ForbiddenError(`Missing required permission: ${permission}.`);
      }
      if (options.quota !== undefined) {
        const decision = options.quota.consume(authContext.principal.id);
        if (!decision.allowed) {
          await record(authContext, tool, 'denied');
          throw new RateLimitedError('Quota exceeded; retry after the window resets.', {
            details: { limit: decision.limit, resetAt: decision.resetAt },
          });
        }
      }
      await record(authContext, tool, 'success');
      return authContext;
    },
  };
}
