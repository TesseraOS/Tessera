/**
 * @tessera/cli — one-command onboarding for a Local Tessera deployment (F-052; FR-70; ADR-0036).
 *
 * The `tessera` bin wraps a small, testable composition over the existing engine: `init` scaffolds
 * config + data, `serve` runs the REST API, `mcp` is the stdio MCP server agents spawn, `source add`
 * ingests a repo, `token issue` mints an API token, `doctor` health-checks the install, and
 * `mcp-config` emits ready-to-paste client config for the major agents. `run` is exported so the CLI
 * can be embedded/tested without spawning a process.
 */
export { run, COMMANDS } from './cli.js';
export type { Command } from './command.js';
export type { Io } from './io.js';
export { CliError } from './errors.js';
export { CLI_VERSION } from './version.js';
export { MCP_CLIENTS, renderMcpClientConfig } from './mcp-clients.js';
export type { McpClient, McpServerSpec } from './mcp-clients.js';
