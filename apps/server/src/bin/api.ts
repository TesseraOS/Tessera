#!/usr/bin/env node
import { loadConfig } from '@tessera/config';
import { createObservability, startTelemetry, type Telemetry } from '@tessera/observability';
import { startApiServer } from '../api.js';

/** `tessera-api` — boot the Local profile and serve the REST `/v1` API with observability. */
async function main(): Promise<void> {
  const config = loadConfig();
  const telemetry: Telemetry | undefined =
    process.env.TESSERA_TELEMETRY === '1'
      ? startTelemetry({ serviceName: 'tessera-api' })
      : undefined;
  const observability = createObservability({
    logger: { level: config.logLevel, name: 'tessera-api' },
  });

  const handle = await startApiServer({ observability });
  handle.app.log.info(`Tessera REST API listening on ${handle.url}`);

  const shutdown = (signal: string): void => {
    handle.app.log.info(`${signal} received — shutting down`);
    void (async () => {
      await handle.close();
      if (telemetry !== undefined) await telemetry.shutdown();
      process.exit(0);
    })();
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  console.error('failed to start Tessera REST API:', error);
  process.exit(1);
});
