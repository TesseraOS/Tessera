import { describe, expect, it } from 'vitest';
import { captureIo } from '../../tests/support/capture-io.js';
import { run } from '../cli.js';

describe('init (validation)', () => {
  it('rejects an unsupported --auth before touching the filesystem', async () => {
    const io = captureIo();
    const code = await run(['init', '--auth', 'oidc'], io);
    expect(code).toBe(1);
    expect(io.err()).toContain('--auth must be one of none|token');
  });

  it('rejects an unknown --embeddings provider', async () => {
    const io = captureIo();
    const code = await run(['init', '--embeddings', 'magic'], io);
    expect(code).toBe(1);
    expect(io.err()).toContain('--embeddings must be one of');
  });
});
