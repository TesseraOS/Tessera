import { describe, expect, it } from 'vitest';
import {
  MCP_CLIENTS,
  renderMcpClientConfig,
  type McpClient,
  type McpServerSpec,
} from './mcp-clients.js';

const spec: McpServerSpec = {
  command: 'npx',
  args: ['-y', '@tessera/cli', 'mcp', '--config', 'C:\\proj\\tessera.config.json'],
};

function client(id: string): McpClient {
  const found = MCP_CLIENTS.find((c) => c.id === id);
  if (found === undefined) throw new Error(`no such client ${id}`);
  return found;
}

describe('MCP client table', () => {
  it('covers the five agents from ADR-0036 with stable ids', () => {
    expect(MCP_CLIENTS.map((c) => c.id)).toEqual([
      'claude-code',
      'cursor',
      'cline',
      'codex',
      'continue',
    ]);
  });

  it('renders JSON-format clients as parseable mcpServers config', () => {
    const rendered = renderMcpClientConfig(client('cursor'), spec);
    const parsed = JSON.parse(rendered) as {
      mcpServers: { tessera: { command: string; args: string[] } };
    };
    expect(parsed.mcpServers.tessera.command).toBe('npx');
    expect(parsed.mcpServers.tessera.args).toContain('mcp');
  });

  it('renders TOML-format clients (Codex) with the mcp_servers table + escaped Windows paths', () => {
    const rendered = renderMcpClientConfig(client('codex'), spec);
    expect(rendered).toContain('[mcp_servers.tessera]');
    expect(rendered).toContain('command = "npx"');
    // Backslashes in the config path must be doubled for a valid TOML string.
    expect(rendered).toContain('C:\\\\proj\\\\tessera.config.json');
  });

  it('includes env only when present', () => {
    const withEnv = renderMcpClientConfig(client('claude-code'), {
      ...spec,
      env: { TESSERA_AUTH_MODE: 'token' },
    });
    const parsed = JSON.parse(withEnv) as { mcpServers: { tessera: { env?: unknown } } };
    expect(parsed.mcpServers.tessera.env).toEqual({ TESSERA_AUTH_MODE: 'token' });

    const withoutEnv = JSON.parse(renderMcpClientConfig(client('claude-code'), spec)) as {
      mcpServers: { tessera: { env?: unknown } };
    };
    expect(withoutEnv.mcpServers.tessera.env).toBeUndefined();
  });
});
