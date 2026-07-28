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
 * the credential is read from the MCP request via {@link CredentialResolver}.
 *
 * **Two resolvers, because the transports differ in kind** (F-072, ADR-0065):
 *
 * - {@link defaultCredentialResolver} reads the SDK `authInfo` / `Authorization` header — populated
 *   only by an HTTP transport's auth middleware. The multi-client streamable-HTTP transport in
 *   `@tessera/mcp/http` (F-055, ADR-0058) carries a per-client Bearer credential on every request,
 *   so each caller is authenticated as itself.
 * - {@link createStaticCredentialResolver} is for **stdio**, which has no request and no headers:
 *   one process, one identity, supplied by the operator when the agent client launches it. Before
 *   F-072 this comment claimed stdio "works (one identity)" — it did not, except in zero-auth `none`
 *   mode where the local provider authenticates anything. Every tool call in token mode returned
 *   UNAUTHORIZED, which is the defect F-048 found and worked around.
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
  | 'list_notifications'
  | 'list_projects'
  | 'create_project'
  | 'rename_project'
  | 'delete_project'
  | 'list_tokens'
  | 'issue_token'
  | 'revoke_token'
  | 'list_skills'
  | 'get_skill';

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
  // The same permission the REST twin requires: a notification is a narrowed view of workspace
  // activity, and read state is self-scoped, so nothing here is available to a caller that could not
  // already read `/v1/stats/activity/recent`.
  list_notifications: 'stats:read',
  list_projects: 'projects:read',
  create_project: 'projects:manage',
  rename_project: 'projects:manage',
  delete_project: 'projects:manage',
  list_tokens: 'admin:manage',
  issue_token: 'admin:manage',
  revoke_token: 'admin:manage',
  // The skills registry is PUBLIC first-party content — the same bytes the marketing site serves
  // unauthenticated. Minting a `skills:read` permission would ripple the RBAC catalog through
  // GET /v1/rbac -> OpenAPI -> the generated SDK -> the dashboard's token-scope UI for content no
  // scope protects, and would leave a token scoped to `search:read` unable to read a public
  // document. Reusing the lowest read every role already holds (viewer upward) keeps least
  // privilege honest and adds nothing to the catalog. Same reasoning as `get_stats` below.
  list_skills: 'search:read',
  get_skill: 'search:read',
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
  // Unlike `get_stats`, this one gets its OWN action rather than borrowing a read: `audit.read` — the
  // only other candidate — is the admin trail-access signal a compliance reader watches, and
  // recording an agent's bell fetch as that would drown it. The REST twin stays unaudited (a row per
  // page load would flood the trail it projects), so the two surfaces differ here on purpose: a
  // rendering client polls, an agent asks.
  list_notifications: 'notification.read',
  list_projects: 'project.read',
  create_project: 'project.manage',
  rename_project: 'project.manage',
  delete_project: 'project.manage',
  list_tokens: 'token.read',
  issue_token: 'token.manage',
  revoke_token: 'token.manage',
  // Mirrors the permission (see TOOL_PERMISSIONS): a catalog discovery read recorded as the
  // discovery action, so the permission<->action pairing stays coherent with every other row and
  // the audit vocabulary gains nothing for content that is public anyway.
  list_skills: 'search',
  get_skill: 'search',
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

/**
 * The **stdio** credential resolver (F-072; ADR-0065) — one process, one identity.
 *
 * stdio carries no request and no headers, so there is nothing per-call to read: the operator
 * supplies a token when the agent client launches `tessera-mcp`, and every call on that connection
 * is that principal. The composition root resolves the token through the deployment's
 * `SecretsProvider` (key `MCP_TOKEN`) and passes it here — this module never touches the
 * environment, which is what keeps it transport-agnostic and testable.
 *
 * **The request context is deliberately ignored, not merged.** A stdio peer controls the JSON-RPC
 * message and could otherwise put an `Authorization` header in `requestInfo` and be authenticated as
 * a principal the operator never granted it — a privilege escalation across a boundary that exists
 * precisely because the launcher, not the peer, decides who this process is.
 *
 * **Use this only for stdio.** Wiring it into the HTTP transport would authenticate every remote
 * caller as the operator; that transport keeps {@link defaultCredentialResolver}.
 */
export function createStaticCredentialResolver(token: string): CredentialResolver {
  const authorization = `Bearer ${token}`;
  return () => ({ authorization, headers: {} });
}

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
  /**
   * Authenticate a **connection-level** request — the HTTP transport's boundary check (F-055,
   * ADR-0058 §5) — using the SAME {@link CredentialResolver} {@link McpGateway.guard} uses, so the
   * boundary and the tools can never disagree about where a credential comes from.
   *
   * There is no tool here, so there is deliberately **no RBAC, no quota, and no audit**: those are
   * per-call concerns and stay in `guard`, which re-runs on every tool call. This exists only so an
   * unauthenticated caller is refused *before* a session and an `McpServer` are allocated for it
   * (NFR-2); over stdio it is simply unused.
   *
   * Throws `UnauthorizedError` for a missing or bad credential.
   */
  authenticate(context: McpCallContext): Promise<AuthContext>;
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
    authenticate(context) {
      return options.auth.authenticate(resolveCredential(context));
    },

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
