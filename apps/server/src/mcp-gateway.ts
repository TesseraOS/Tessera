import type { Runtime } from '@tessera/config';
import {
  createInMemoryQuotaLimiter,
  createMcpGateway,
  createStaticCredentialResolver,
  type McpGateway,
} from '@tessera/mcp';

/** Per-transport gateway options. */
export interface RuntimeGatewayOptions {
  /**
   * A single operator-supplied credential every call on this connection presents (F-072; ADR-0065).
   *
   * **stdio only.** That transport has no request and no headers, so one process is one identity and
   * the launcher decides who it is. Passing this on the HTTP transport would authenticate every
   * remote caller as the operator, which is why `mcp-http.ts` never does — see
   * `createStaticCredentialResolver`.
   */
  readonly staticCredential?: string;
}

/**
 * Build the MCP gateway from the runtime's own providers (F-026/F-034/F-047).
 *
 * Extracted so the **stdio** transport ([`./mcp.ts`]) and the **HTTP** transport ([`./mcp-http.ts`],
 * F-055) construct an identical gateway. Two call sites assembling this by hand is how one surface
 * quietly ends up unmetered or unaudited.
 *
 * Every piece here is Fastify-free (the F-012 invariant).
 */
export function createRuntimeGateway(
  runtime: Runtime,
  options: RuntimeGatewayOptions = {},
): McpGateway {
  const { quota } = runtime.config.auth;
  return createMcpGateway({
    // The runtime's configured provider; the local provider = full access, so `none` mode is unchanged.
    auth: runtime.auth.provider,
    // Quotas engage only when configured.
    ...(quota.enabled
      ? { quota: createInMemoryQuotaLimiter({ limit: quota.limit, windowMs: quota.windowMs }) }
      : {}),
    // The SAME sink and taxonomy the REST surface records into, so one trail covers both (ADR-0036).
    ...(runtime.audit !== undefined ? { audit: runtime.audit } : {}),
    // Absent ⇒ the default per-request resolver (HTTP headers / SDK authInfo), unchanged.
    ...(options.staticCredential !== undefined
      ? { resolveCredential: createStaticCredentialResolver(options.staticCredential) }
      : {}),
  });
}

/**
 * The key the stdio credential is stored under, in whichever {@link SecretsProvider} the deployment
 * configured (F-072). With the default `env` provider and its `TESSERA_SECRET_` prefix that reads
 * `TESSERA_SECRET_MCP_TOKEN`; with `secrets.provider: file` it is the `MCP_TOKEN` entry in the
 * secrets JSON.
 *
 * Reusing the existing provider rather than minting a dedicated variable of its own is the decision
 * (ADR-0065): it gives the env **and** file channels with one key, and the file channel is what
 * answers the real hazard — agent-client config files get synced and committed.
 *
 * (This comment names no bespoke variable literally: `verify-state`'s env-docs check scans source
 * for env-var-shaped tokens and would demand that one be documented in `.env.example`. It was right
 * to flag the earlier wording — prose that spells out a variable reads exactly like a use of it.)
 */
export const MCP_CREDENTIAL_SECRET_KEY = 'MCP_TOKEN';

/**
 * Resolve the stdio credential, or explain precisely why the process cannot serve.
 *
 * **Refuses to start** when the deployment requires a credential and none is set, rather than
 * booting cleanly and failing all twenty tools with UNAUTHORIZED — the confusing state F-048 hit,
 * and one that is 100% fatal either way. Agent clients surface stderr, so this is the visible form.
 *
 * Zero-auth `none` mode reads nothing and returns `undefined`: the local provider authenticates
 * anything, so a credential there would be theatre.
 */
export async function resolveStdioCredential(runtime: Runtime): Promise<string | undefined> {
  if (runtime.config.auth.mode === 'none') return undefined;

  const token = await runtime.secrets.get(MCP_CREDENTIAL_SECRET_KEY);
  if (token === undefined || token.trim() === '') {
    throw new Error(
      `auth.mode "${runtime.config.auth.mode}" requires an MCP credential over stdio: set the ` +
        `${MCP_CREDENTIAL_SECRET_KEY} secret (env: TESSERA_SECRET_${MCP_CREDENTIAL_SECRET_KEY}) in ` +
        'the env block of your agent client config. Issue one with `tessera token issue`, or run ' +
        '`tessera mcp-config` for a ready-to-paste snippet.',
    );
  }
  // Trimmed because a token pasted into a JSON config or read from a file routinely carries a
  // trailing newline, and a Bearer value with one is rejected as a bad credential — an error that
  // reads like a wrong token and is not.
  return token.trim();
}
