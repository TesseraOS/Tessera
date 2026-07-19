import { flagBool, flagStr, parseArgs } from '../args.js';
import type { Command } from '../command.js';
import { configPath } from '../config-file.js';
import { CliError } from '../errors.js';
import { line, type Io } from '../io.js';
import {
  MCP_CLIENTS,
  renderMcpClientConfig,
  type McpClient,
  type McpServerSpec,
} from '../mcp-clients.js';
import { printJson } from '../output.js';

/** Build the launch spec agents use to spawn the Tessera stdio MCP server (`tessera mcp`). */
function buildSpec(io: Io, args: ReturnType<typeof parseArgs>): McpServerSpec {
  const cfgPath = configPath(io, flagStr(args, 'config'));
  const command = flagStr(args, 'command');
  // `--command tessera` (or an absolute path) emits a local-dev form; the default targets the
  // published package via npx so a fresh machine needs nothing installed first.
  return command !== undefined
    ? { command, args: ['mcp', '--config', cfgPath] }
    : { command: 'npx', args: ['-y', '@tessera/cli', 'mcp', '--config', cfgPath] };
}

async function runMcpConfig(io: Io, argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv, { booleans: ['json'] });
  const json = flagBool(args, 'json');
  const agent = flagStr(args, 'agent');
  const spec = buildSpec(io, args);

  let clients: readonly McpClient[] = MCP_CLIENTS;
  if (agent !== undefined) {
    const match = MCP_CLIENTS.find((client) => client.id === agent);
    if (match === undefined) {
      throw new CliError(`unknown agent '${agent}'`, {
        hint: `known agents: ${MCP_CLIENTS.map((c) => c.id).join(', ')}`,
      });
    }
    clients = [match];
  }

  if (json) {
    printJson(io, {
      server: spec,
      clients: clients.map((client) => ({
        id: client.id,
        label: client.label,
        file: client.file,
        format: client.format,
        config: renderMcpClientConfig(client, spec),
      })),
    });
    return 0;
  }

  clients.forEach((client, index) => {
    if (index > 0) line(io);
    line(io, `# ${client.label} — ${client.file}`);
    line(io, renderMcpClientConfig(client, spec));
  });
  return 0;
}

export const mcpConfigCommand: Command = {
  name: 'mcp-config',
  summary: 'Emit ready-to-paste MCP client config for the major agents.',
  usage: [
    'Usage: tessera mcp-config [--agent <id>] [--config <path>] [--command <cmd>] [--json]',
    '',
    `Agents: ${MCP_CLIENTS.map((c) => c.id).join(', ')}`,
    '',
    'Prints the connection snippet each agent needs to launch the Tessera stdio MCP server.',
    'By default every agent is emitted; --agent selects one. --command overrides the launcher',
    "(default 'npx -y @tessera/cli mcp'); --config sets the config path passed to the server.",
  ].join('\n'),
  run: runMcpConfig,
};
