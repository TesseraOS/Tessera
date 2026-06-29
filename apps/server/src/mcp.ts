import type { Runtime } from '@tessera/config';
import { startMcpStdio } from '@tessera/mcp';
import { createServerRuntime, type ServerRuntimeOptions } from './bootstrap.js';

/** The connected MCP server, typed through `@tessera/mcp` (no direct SDK dependency). */
type ConnectedMcpServer = Awaited<ReturnType<typeof startMcpStdio>>;

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
export async function startMcpServer(options: ServerRuntimeOptions = {}): Promise<McpServerHandle> {
  const runtime = await createServerRuntime(options);
  const server = await startMcpStdio(runtime.services);

  return {
    runtime,
    server,
    async close() {
      await server.close();
      await runtime.close();
    },
  };
}
