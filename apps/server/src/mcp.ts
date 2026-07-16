import type { Runtime } from '@tessera/config';
import { createInMemoryQuotaLimiter, createMcpGateway, startMcpStdio } from '@tessera/mcp';
import { instrumentServices, type Observability } from '@tessera/observability';
import { createServerRuntime, type ServerRuntimeOptions } from './bootstrap.js';

/** The connected MCP server, typed through `@tessera/mcp` (no direct SDK dependency). */
type ConnectedMcpServer = Awaited<ReturnType<typeof startMcpStdio>>;

export interface McpServerOptions extends ServerRuntimeOptions {
  /** When provided, tool calls are traced + timed (F-016). */
  readonly observability?: Observability;
}

export interface McpServerHandle {
  readonly runtime: Runtime;
  readonly server: ConnectedMcpServer;
  /** Stop serving and release the runtime's handles. */
  close(): Promise<void>;
}

/**
 * Boot the Local profile and serve the MCP tools (F-012) over **stdio** — the transport agent
 * clients launch. Nothing is written to stdout except the protocol; logs go to stderr.
 */
export async function startMcpServer(options: McpServerOptions = {}): Promise<McpServerHandle> {
  const runtime = await createServerRuntime(options);
  const services =
    options.observability === undefined
      ? runtime.services
      : instrumentServices(runtime.services, options.observability);

  // Gate the tools with the runtime's provider (F-026/F-034); the local provider = full access, so
  // `none` mode is unchanged. Quotas engage only when configured. All gateway pieces are Fastify-free.
  const quota = runtime.config.auth.quota;
  const gateway = createMcpGateway({
    auth: runtime.auth.provider,
    ...(quota.enabled
      ? { quota: createInMemoryQuotaLimiter({ limit: quota.limit, windowMs: quota.windowMs }) }
      : {}),
    // Record agent tool calls into the runtime's trail (F-047, closes the F-027 seam) — the SAME sink
    // and taxonomy the REST surface records into, so one trail covers both surfaces (ADR-0036).
    ...(runtime.audit !== undefined ? { audit: runtime.audit } : {}),
  });
  const server = await startMcpStdio(services, {
    gateway,
    // Back the token-management tools with the runtime's token store (F-046; present in token mode).
    ...(runtime.auth.tokenStore !== undefined ? { tokenStore: runtime.auth.tokenStore } : {}),
  });

  return {
    runtime,
    server,
    async close() {
      await server.close();
      await runtime.close();
    },
  };
}
