import { loadConfig } from '@tessera/config';
import { createObservability } from '@tessera/observability';
import { startMcpServer } from '@tessera/server';
import { flagStr, parseArgs } from '../args.js';
import type { Command } from '../command.js';
import { loadConfigFile } from '../config-file.js';
import { type Io } from '../io.js';
import { waitForShutdownSignal } from '../signal.js';

/** A running stdio MCP server the caller must eventually `close()`. */
export interface McpHandle {
  close(): Promise<void>;
}

/**
 * Boot the Local profile and serve the MCP tools over **stdio** — what an agent client spawns (the
 * exact path the shipped `tessera-mcp` bin uses). stdout carries the MCP protocol only; logs +
 * diagnostics go to stderr. Exported so the boot is reusable/inspectable apart from the signal wait.
 */
export async function serveMcp(io: Io, options: { config?: string } = {}): Promise<McpHandle> {
  const { input } = loadConfigFile(io, options.config);
  const config = loadConfig(io.env, input);
  const observability = createObservability({
    logger: { level: config.logLevel, name: 'tessera-mcp', stderr: true },
  });
  const handle = await startMcpServer({ env: io.env, config: input, observability });
  return { close: () => handle.close() };
}

async function runMcp(io: Io, argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);
  const config = flagStr(args, 'config');
  const handle = await serveMcp(io, config !== undefined ? { config } : {});
  await waitForShutdownSignal();
  await handle.close();
  return 0;
}

export const mcpCommand: Command = {
  name: 'mcp',
  summary: 'Run the MCP server over stdio (agents spawn this).',
  usage: [
    'Usage: tessera mcp [--config <path>]',
    '',
    'Serves the Tessera MCP tools over stdio — the transport agent clients launch. stdout carries',
    'the MCP protocol only; logs go to stderr. Normally you do not run this by hand: paste the',
    'output of `tessera mcp-config` into your agent and it spawns this for you.',
  ].join('\n'),
  run: runMcp,
};
