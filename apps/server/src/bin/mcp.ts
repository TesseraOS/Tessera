#!/usr/bin/env node
import { loadConfig } from '@tessera/config';
import { createObservability, startTelemetry, type Telemetry } from '@tessera/observability';
import { startMcpServer } from '../mcp.js';

/**
 * `tessera-mcp` — boot the Local profile and serve the MCP tools over stdio. stdout carries the MCP
 * protocol only; logs and telemetry diagnostics go to stderr.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const telemetry: Telemetry | undefined =
    process.env.TESSERA_TELEMETRY === '1'
      ? startTelemetry({ serviceName: 'tessera-mcp', httpInstrumentation: false })
      : undefined;
  const observability = createObservability({
    logger: { level: config.logLevel, name: 'tessera-mcp', stderr: true },
  });

  const handle = await startMcpServer({ observability });

  const shutdown = (): void => {
    void (async () => {
      await handle.close();
      if (telemetry !== undefined) await telemetry.shutdown();
      process.exit(0);
    })();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  console.error('failed to start Tessera MCP server:', error);
  process.exit(1);
});
