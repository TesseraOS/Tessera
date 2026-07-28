import { describe, expect, it } from 'vitest';
import { captureIo } from '../../tests/support/capture-io.js';
import { run } from '../cli.js';

interface McpConfigReport {
  server: { command: string; args: string[]; env?: Record<string, string> };
  clients: { id: string; label: string; file: string; format: string; config: string }[];
}

describe('mcp-config', () => {
  it('emits every agent as JSON with an npx launcher pointing at the config path', async () => {
    const io = captureIo();
    const code = await run(['mcp-config', '--json', '--config', '/abs/tessera.config.json'], io);
    expect(code).toBe(0);
    const report = JSON.parse(io.out()) as McpConfigReport;
    expect(report.server.command).toBe('npx');
    expect(report.server.args).toEqual([
      '-y',
      '@tessera/cli',
      'mcp',
      '--config',
      '/abs/tessera.config.json',
    ]);
    expect(report.clients.map((c) => c.id)).toContain('codex');
    expect(report.clients).toHaveLength(5);
  });

  it('emits a single agent snippet when --agent is given', async () => {
    const io = captureIo();
    const code = await run(['mcp-config', '--agent', 'codex', '--config', '/abs/cfg.json'], io);
    expect(code).toBe(0);
    expect(io.out()).toContain('# Codex CLI');
    expect(io.out()).toContain('[mcp_servers.tessera]');
  });

  it('honours --command for a local-dev launcher', async () => {
    const io = captureIo();
    await run(['mcp-config', '--agent', 'cursor', '--command', 'tessera', '--json'], io);
    const report = JSON.parse(io.out()) as McpConfigReport;
    expect(report.server.command).toBe('tessera');
    expect(report.server.args[0]).toBe('mcp');
  });

  // --- the stdio credential (F-072; ADR-0065) -------------------------------------------------

  it('emits no env block by default — correct for zero-auth local', async () => {
    const io = captureIo();
    await run(['mcp-config', '--agent', 'cursor', '--json'], io);
    expect((JSON.parse(io.out()) as McpConfigReport).server.env).toBeUndefined();
  });

  it('--token emits a PLACEHOLDER, never a secret', async () => {
    const io = captureIo();
    await run(['mcp-config', '--agent', 'cursor', '--token', '--json'], io);
    const report = JSON.parse(io.out()) as McpConfigReport;
    expect(report.server.env).toEqual({ TESSERA_SECRET_MCP_TOKEN: 'paste-your-token-here' });
    // The snippet the operator pastes carries the env block, not just the JSON report.
    expect(report.clients[0]?.config).toContain('TESSERA_SECRET_MCP_TOKEN');
  });

  it('offers NO way to put a token value on the command line', async () => {
    // The whole reason the env channel was chosen: a value in argv is visible to a process listing
    // and lands in shell history. `--token` is a boolean, so a value after it is a separate arg and
    // cannot become the credential.
    const io = captureIo();
    await run(['mcp-config', '--agent', 'cursor', '--token', 'tok_secret', '--json'], io);
    const rendered = io.out();
    expect(rendered).not.toContain('tok_secret');
    expect(rendered).toContain('paste-your-token-here');
  });

  it('--secrets-file points at a file instead, keeping the token out of the client config', async () => {
    const io = captureIo();
    await run(['mcp-config', '--agent', 'cursor', '--secrets-file', '/etc/tessera/s.json', '--json'], io); // prettier-ignore
    const report = JSON.parse(io.out()) as McpConfigReport;
    expect(report.server.env).toEqual({
      TESSERA_SECRETS_PROVIDER: 'file',
      TESSERA_SECRETS_FILE: '/etc/tessera/s.json',
    });
  });

  it('refuses --token together with --secrets-file', async () => {
    const io = captureIo();
    // A deployment reads MCP_TOKEN from ONE provider; emitting both would produce a config whose
    // effective credential depends on precedence the operator cannot see.
    const code = await run(
      ['mcp-config', '--agent', 'cursor', '--token', '--secrets-file', '/s.json'],
      io,
    );
    expect(code).not.toBe(0);
    expect(io.err()).toContain('mutually exclusive');
  });

  it('renders the credential into the TOML client too, not only JSON ones', async () => {
    const io = captureIo();
    await run(['mcp-config', '--agent', 'codex', '--token'], io);
    expect(io.out()).toContain('[mcp_servers.tessera.env]');
    expect(io.out()).toContain('TESSERA_SECRET_MCP_TOKEN = "paste-your-token-here"');
  });
});
