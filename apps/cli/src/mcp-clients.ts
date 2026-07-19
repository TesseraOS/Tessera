/**
 * The agent clients `mcp-config` emits connection snippets for (ADR-0036). This is a **data table** so
 * supporting a new agent is a new row, not new code (F-052 acceptance): each row declares where the
 * config lives and which of the two known formats it uses. The two `render*` functions below turn a
 * shared {@link McpServerSpec} into that format — the only place output shape lives.
 */
export type McpClientFormat = 'json-mcpservers' | 'toml-mcp-servers';

export interface McpClient {
  /** Stable id used by `--agent <id>`. */
  readonly id: string;
  /** Human label for the printed header. */
  readonly label: string;
  /** Where the user pastes the snippet (documentation only — the CLI never writes it). */
  readonly file: string;
  readonly format: McpClientFormat;
}

/** How an agent client should launch the Tessera MCP stdio server. */
export interface McpServerSpec {
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
}

/**
 * The supported agent clients. Ordered as they appear in `mcp-config` output. Kept intentionally small
 * and declarative; the exact per-client schema evolves upstream, so we emit the widely-accepted
 * `mcpServers` (JSON) / `mcp_servers` (TOML) shape and name the target file for the user to confirm.
 */
export const MCP_CLIENTS: readonly McpClient[] = [
  { id: 'claude-code', label: 'Claude Code', file: '.mcp.json (project) or ~/.claude.json', format: 'json-mcpservers' }, // prettier-ignore
  { id: 'cursor', label: 'Cursor', file: '.cursor/mcp.json (project) or ~/.cursor/mcp.json', format: 'json-mcpservers' }, // prettier-ignore
  { id: 'cline', label: 'Cline', file: 'cline_mcp_settings.json (VS Code settings dir)', format: 'json-mcpservers' }, // prettier-ignore
  { id: 'codex', label: 'Codex CLI', file: '~/.codex/config.toml', format: 'toml-mcp-servers' },
  { id: 'continue', label: 'Continue', file: '~/.continue/config.json', format: 'json-mcpservers' },
];

/** Escape a string for a double-quoted TOML value (backslash + quote; Windows paths need the former). */
function tomlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function renderJson(spec: McpServerSpec): string {
  const server: Record<string, unknown> = { command: spec.command, args: [...spec.args] };
  if (spec.env !== undefined && Object.keys(spec.env).length > 0) server['env'] = { ...spec.env };
  return JSON.stringify({ mcpServers: { tessera: server } }, null, 2);
}

function renderToml(spec: McpServerSpec): string {
  const argList = spec.args.map(tomlString).join(', ');
  const lines = [
    '[mcp_servers.tessera]',
    `command = ${tomlString(spec.command)}`,
    `args = [${argList}]`,
  ];
  if (spec.env !== undefined && Object.keys(spec.env).length > 0) {
    lines.push('', '[mcp_servers.tessera.env]');
    for (const [key, value] of Object.entries(spec.env))
      lines.push(`${key} = ${tomlString(value)}`);
  }
  return lines.join('\n');
}

/** Render the connection snippet for `client` from `spec`, in the client's declared format. */
export function renderMcpClientConfig(client: McpClient, spec: McpServerSpec): string {
  return client.format === 'toml-mcp-servers' ? renderToml(spec) : renderJson(spec);
}
