import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Env } from '@tessera/config';
import type { Io } from '../../src/io.js';

/** An {@link Io} that captures what commands write, for deterministic assertions in tests. */
export interface CapturedIo extends Io {
  /** Everything written to stdout so far. */
  out(): string;
  /** Everything written to stderr so far. */
  err(): string;
}

/**
 * Build a capturing {@link Io} with an injected env + cwd + home.
 *
 * `home` defaults to a path under the OS temp dir, NOT the real home directory: a test that let
 * `skills install --global` write into a live `~/.claude/skills` could delete a skill the user
 * actually authored when it cleaned up. Pass an explicit path when the test asserts on it.
 */
export function captureIo(options: { env?: Env; cwd?: string; home?: string } = {}): CapturedIo {
  let out = '';
  let err = '';
  return {
    write: (text) => {
      out += text;
    },
    writeErr: (text) => {
      err += text;
    },
    env: options.env ?? {},
    cwd: options.cwd ?? process.cwd(),
    home: options.home ?? join(tmpdir(), 'tessera-test-home'),
    out: () => out,
    err: () => err,
  };
}
