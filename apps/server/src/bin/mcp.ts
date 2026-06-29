#!/usr/bin/env node
import { startMcpServer } from '../mcp.js';

/**
 * `tessera-mcp` — boot the Local profile and serve the MCP tools over stdio. stdout carries the MCP
 * protocol only; diagnostics go to stderr.
 */
async function main(): Promise<void> {
  const handle = await startMcpServer();

  const shutdown = (): void => {
    void handle.close().then(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  console.error('failed to start Tessera MCP server:', error);
  process.exit(1);
});
