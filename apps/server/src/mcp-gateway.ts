import type { Runtime } from '@tessera/config';
import { createInMemoryQuotaLimiter, createMcpGateway, type McpGateway } from '@tessera/mcp';

/**
 * Build the MCP gateway from the runtime's own providers (F-026/F-034/F-047).
 *
 * Extracted so the **stdio** transport ([`./mcp.ts`]) and the **HTTP** transport ([`./mcp-http.ts`],
 * F-055) construct an identical gateway. Two call sites assembling this by hand is how one surface
 * quietly ends up unmetered or unaudited.
 *
 * Every piece here is Fastify-free (the F-012 invariant).
 */
export function createRuntimeGateway(runtime: Runtime): McpGateway {
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
  });
}
