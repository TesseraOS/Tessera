import { describe, expect, it } from 'vitest';
import { captureIo } from '../../tests/support/capture-io.js';
import { run } from '../cli.js';

interface McpConfigReport {
  server: { command: string; args: string[] };
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
});
