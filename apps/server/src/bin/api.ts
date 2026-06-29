#!/usr/bin/env node
import { startApiServer } from '../api.js';

/** `tessera-api` — boot the Local profile and serve the REST `/v1` API. */
async function main(): Promise<void> {
  const handle = await startApiServer({ logger: true });
  handle.app.log.info(`Tessera REST API listening on ${handle.url}`);

  const shutdown = (signal: string): void => {
    handle.app.log.info(`${signal} received — shutting down`);
    void handle.close().then(() => process.exit(0));
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  console.error('failed to start Tessera REST API:', error);
  process.exit(1);
});
