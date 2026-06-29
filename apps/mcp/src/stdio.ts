import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { ApiServices } from '@tessera/api';
import { buildMcpServer } from './server.js';

/**
 * Build the server and serve it over stdio — the transport agent clients (Claude Desktop/Code,
 * Cursor, …) launch. Services are injected; the deployment profile that constructs them and the
 * launchable process entry are F-015.
 */
export async function startMcpStdio(services: ApiServices): Promise<McpServer> {
  const server = buildMcpServer(services);
  await server.connect(new StdioServerTransport());
  return server;
}
