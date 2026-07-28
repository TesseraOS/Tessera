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

/**
 * The value emitted in place of a real token (F-072).
 *
 * A **placeholder**, never the secret: there is deliberately no `--token <value>` flag. A value
 * passed on a command line is visible to `ps`/`wmic process get commandline` for any user on the
 * box while it runs, and lands in the operator's shell history — which would defeat the whole point
 * of choosing an env-var channel (ADR-0065). The operator pastes the token into the config file the
 * snippet is destined for, or uses `--secrets-file` and keeps it out of that file too.
 */
const TOKEN_PLACEHOLDER = 'paste-your-token-here';

/**
 * The credential env block for the emitted snippet (F-072; ADR-0065).
 *
 * `--token` names the secret the deployment reads over stdio; `--secrets-file` points at a secrets
 * JSON holding `MCP_TOKEN` instead, so a config file that gets synced or committed carries a path
 * rather than a credential. Neither flag ⇒ no env block, which is correct for zero-auth `none` mode.
 */
function credentialEnv(args: ReturnType<typeof parseArgs>): Record<string, string> | undefined {
  const wantsToken = flagBool(args, 'token');
  const secretsFile = flagStr(args, 'secrets-file');

  if (wantsToken && secretsFile !== undefined) {
    throw new CliError('--token and --secrets-file are mutually exclusive', {
      hint: 'a deployment reads MCP_TOKEN from ONE secrets provider — pick the env var or the file',
    });
  }
  if (secretsFile !== undefined) {
    return { TESSERA_SECRETS_PROVIDER: 'file', TESSERA_SECRETS_FILE: secretsFile };
  }
  return wantsToken ? { TESSERA_SECRET_MCP_TOKEN: TOKEN_PLACEHOLDER } : undefined;
}

/** Build the launch spec agents use to spawn the Tessera stdio MCP server (`tessera mcp`). */
function buildSpec(io: Io, args: ReturnType<typeof parseArgs>): McpServerSpec {
  const cfgPath = configPath(io, flagStr(args, 'config'));
  const command = flagStr(args, 'command');
  const env = credentialEnv(args);
  // `--command tessera` (or an absolute path) emits a local-dev form; the default targets the
  // published package via npx so a fresh machine needs nothing installed first.
  const launcher =
    command !== undefined
      ? { command, args: ['mcp', '--config', cfgPath] }
      : { command: 'npx', args: ['-y', '@tessera/cli', 'mcp', '--config', cfgPath] };
  return env !== undefined ? { ...launcher, env } : launcher;
}

async function runMcpConfig(io: Io, argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv, { booleans: ['json', 'token'] });
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
    'Usage: tessera mcp-config [--agent <id>] [--config <path>] [--command <cmd>]',
    '                         [--token | --secrets-file <path>] [--json]',
    '',
    `Agents: ${MCP_CLIENTS.map((c) => c.id).join(', ')}`,
    '',
    'Prints the connection snippet each agent needs to launch the Tessera stdio MCP server.',
    'By default every agent is emitted; --agent selects one. --command overrides the launcher',
    "(default 'npx -y @tessera/cli mcp'); --config sets the config path passed to the server.",
    '',
    'Credentials (needed when auth.mode is token or oidc — stdio carries no headers):',
    `  --token                include TESSERA_SECRET_MCP_TOKEN=${TOKEN_PLACEHOLDER}, for you`,
    '                         to replace in the config file. There is no --token <value> flag:',
    '                         a secret on a command line is visible to a process listing and',
    '                         lands in your shell history.',
    '  --secrets-file <path>  point the server at a secrets JSON holding MCP_TOKEN instead, so a',
    '                         config file that gets synced or committed carries a path, not a token.',
    '',
    "Issue a token with 'tessera token issue'.",
  ].join('\n'),
  run: runMcpConfig,
};
