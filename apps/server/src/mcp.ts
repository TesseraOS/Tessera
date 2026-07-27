import type { Runtime } from '@tessera/config';
import { startMcpStdio } from '@tessera/mcp';
import { instrumentServices, type Observability } from '@tessera/observability';
import { createServerRuntime, type ServerRuntimeOptions } from './bootstrap.js';
import { createRuntimeGateway } from './mcp-gateway.js';

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

  // Gate the tools with the runtime's providers (F-026/F-034/F-047) — the same gateway the remote HTTP
  // transport builds, so the two transports cannot drift in what they enforce.
  const gateway = createRuntimeGateway(runtime);
  const server = await startMcpStdio(services, {
    gateway,
    // Back the token-management tools with the runtime's token store (F-046; present in token mode).
    ...(runtime.auth.tokenStore !== undefined ? { tokenStore: runtime.auth.tokenStore } : {}),
    // Meter the agent surface too (F-057; NFR-12) — the population the entitlement exists to meter.
    usage: runtime.usage,
    metered: runtime.metered,
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
