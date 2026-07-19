import type { Io } from './io.js';

/**
 * A top-level `tessera` command. `run` receives the raw tokens **after** the command name and parses
 * them itself (with its own boolean spec — see {@link import('./args.js').parseArgs}), returning the
 * process exit code. Commands write only through {@link Io} and never call `process.exit`.
 */
export interface Command {
  readonly name: string;
  /** One-line summary for the top-level help listing. */
  readonly summary: string;
  /** Usage/`--help` text for this command (printed on `<cmd> --help`). */
  readonly usage: string;
  run(io: Io, argv: readonly string[]): Promise<number>;
}
