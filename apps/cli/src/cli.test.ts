import { describe, expect, it } from 'vitest';
import { captureIo } from '../tests/support/capture-io.js';
import { run } from './cli.js';
import { CLI_VERSION } from './version.js';

describe('run (router)', () => {
  it('prints help and exits 0 with no args', async () => {
    const io = captureIo();
    const code = await run([], io);
    expect(code).toBe(0);
    expect(io.out()).toContain('Usage: tessera <command>');
    expect(io.out()).toContain('doctor');
    expect(io.out()).toContain('mcp-config');
  });

  it('prints the version for --version', async () => {
    const io = captureIo();
    const code = await run(['--version'], io);
    expect(code).toBe(0);
    expect(io.out().trim()).toBe(CLI_VERSION);
  });

  it('errors on an unknown command', async () => {
    const io = captureIo();
    const code = await run(['frobnicate'], io);
    expect(code).toBe(1);
    expect(io.err()).toContain("unknown command 'frobnicate'");
  });

  it('prints command usage for <cmd> --help', async () => {
    const io = captureIo();
    const code = await run(['doctor', '--help'], io);
    expect(code).toBe(0);
    expect(io.out()).toContain('Usage: tessera doctor');
  });

  it('funnels a CliError to stderr with its exit code', async () => {
    const io = captureIo();
    const code = await run(['mcp-config', '--agent', 'nope'], io);
    expect(code).toBe(1);
    expect(io.err()).toContain("unknown agent 'nope'");
    expect(io.err()).toContain('hint:');
  });
});
