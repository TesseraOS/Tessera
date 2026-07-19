import { describe, expect, it } from 'vitest';
import { captureIo } from '../../tests/support/capture-io.js';
import { run } from '../cli.js';

describe('source (dispatch + validation)', () => {
  it('reports a missing subcommand', async () => {
    const io = captureIo();
    expect(await run(['source'], io)).toBe(1);
    expect(io.err()).toContain('missing subcommand');
  });

  it('rejects an unknown subcommand', async () => {
    const io = captureIo();
    expect(await run(['source', 'remove'], io)).toBe(1);
    expect(io.err()).toContain("unknown source subcommand 'remove'");
  });

  it('requires a target for add (before any runtime boot)', async () => {
    const io = captureIo();
    expect(await run(['source', 'add'], io)).toBe(1);
    expect(io.err()).toContain('source add needs a <path|git-url>');
  });
});

describe('token (dispatch + validation)', () => {
  it('reports a missing subcommand', async () => {
    const io = captureIo();
    expect(await run(['token'], io)).toBe(1);
    expect(io.err()).toContain('missing subcommand');
  });

  it('requires at least one valid role (before any runtime boot)', async () => {
    const io = captureIo();
    expect(await run(['token', 'issue'], io)).toBe(1);
    expect(io.err()).toContain('--roles must be a comma list');
  });

  it('rejects an unknown role', async () => {
    const io = captureIo();
    expect(await run(['token', 'issue', '--roles', 'wizard'], io)).toBe(1);
    expect(io.err()).toContain('unknown: wizard');
  });
});

describe('serve (validation)', () => {
  it('rejects a non-numeric --port (before any runtime boot)', async () => {
    const io = captureIo();
    expect(await run(['serve', '--port', 'abc'], io)).toBe(1);
    expect(io.err()).toContain('--port must be a non-negative integer');
  });
});
