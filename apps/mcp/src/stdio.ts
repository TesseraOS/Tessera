import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { ApiServices } from '@tessera/api';
import { buildMcpServer, type BuildMcpServerOptions } from './server.js';

/**
 * Build the server and serve it over stdio — the transport agent clients (Claude Desktop/Code,
 * Cursor, …) launch. Services are injected; an optional {@link BuildMcpServerOptions.gateway} enforces
 * auth + quotas (F-026/F-034). The deployment profile that constructs them and the launchable process
 * entry are F-015/F-032.
 */
export async function startMcpStdio(
  services: ApiServices,
  options: BuildMcpServerOptions = {},
): Promise<McpServer> {
  const server = buildMcpServer(services, options);
  await server.connect(new StdioServerTransport());
  return server;
}
