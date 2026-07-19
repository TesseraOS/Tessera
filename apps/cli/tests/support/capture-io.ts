import type { Env } from '@tessera/config';
import type { Io } from '../../src/io.js';

/** An {@link Io} that captures what commands write, for deterministic assertions in tests. */
export interface CapturedIo extends Io {
  /** Everything written to stdout so far. */
  out(): string;
  /** Everything written to stderr so far. */
  err(): string;
}

/** Build a capturing {@link Io} with an injected env + cwd (both default to empty/process cwd). */
export function captureIo(options: { env?: Env; cwd?: string } = {}): CapturedIo {
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
    out: () => out,
    err: () => err,
  };
}
