import { loadConfig } from '@tessera/config';
import { createObservability } from '@tessera/observability';
import { startApiServer } from '@tessera/server';
import { flagStr, parseArgs } from '../args.js';
import type { Command } from '../command.js';
import { loadConfigFile } from '../config-file.js';
import { CliError } from '../errors.js';
import { errline, type Io } from '../io.js';
import { waitForShutdownSignal } from '../signal.js';

/** A running REST server the caller must eventually `close()`. */
export interface ServeHandle {
  readonly url: string;
  close(): Promise<void>;
}

export interface ServeOptions {
  readonly config?: string;
  readonly host?: string;
  readonly port?: number;
}

/**
 * Boot the Local profile and serve the REST `/v1` API with observability (the exact path the shipped
 * `tessera-api` bin uses). Exported so tests can boot → assert → close without the signal wait that the
 * `serve` command layers on top.
 */
export async function serveApi(io: Io, options: ServeOptions = {}): Promise<ServeHandle> {
  const { input } = loadConfigFile(io, options.config);
  const config = loadConfig(io.env, input); // validate + resolve the log level
  const observability = createObservability({
    logger: { level: config.logLevel, name: 'tessera' },
  });
  const handle = await startApiServer({
    env: io.env,
    config: input,
    observability,
    ...(options.host !== undefined ? { host: options.host } : {}),
    ...(options.port !== undefined ? { port: options.port } : {}),
  });
  return { url: handle.url, close: () => handle.close() };
}

async function runServe(io: Io, argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);
  const portStr = flagStr(args, 'port');
  let port: number | undefined;
  if (portStr !== undefined) {
    port = Number.parseInt(portStr, 10);
    if (!Number.isInteger(port) || port < 0) {
      throw new CliError('--port must be a non-negative integer');
    }
  }

  const config = flagStr(args, 'config');
  const host = flagStr(args, 'host');
  const handle = await serveApi(io, {
    ...(config !== undefined ? { config } : {}),
    ...(host !== undefined ? { host } : {}),
    ...(port !== undefined ? { port } : {}),
  });

  // Guidance goes to stderr so stdout stays clean for anything piping the server's output.
  errline(io, `Tessera REST API listening on ${handle.url}`);
  errline(io, 'MCP: agents spawn `tessera mcp` (see `tessera mcp-config`). Press Ctrl+C to stop.');

  await waitForShutdownSignal();
  errline(io, 'shutting down …');
  await handle.close();
  return 0;
}

export const serveCommand: Command = {
  name: 'serve',
  summary: 'Run the REST /v1 API (long-running).',
  usage: [
    'Usage: tessera serve [--host <host>] [--port <port>] [--config <path>]',
    '',
    'Boots the Local profile and serves the REST API until interrupted (Ctrl+C).',
    'Defaults: host 127.0.0.1, port 3000 (or HOST/PORT env). The MCP server is separate —',
    'agents launch `tessera mcp` over stdio; run `tessera mcp-config` to emit their config.',
  ].join('\n'),
  run: runServe,
};
