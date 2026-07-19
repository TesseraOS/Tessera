import type { Env } from '@tessera/config';

/**
 * The side-effect surface every command writes through, injected rather than referenced globally so
 * commands are deterministic and testable: `bin/tessera.ts` supplies a process-backed {@link Io}; tests
 * supply a capturing one. Commands NEVER call `process.exit`/`console.*` directly — the router turns a
 * command's returned exit code into the process exit.
 */
export interface Io {
  /** Write to stdout (agent-/pipe-facing output: results, `--json` payloads). */
  write(text: string): void;
  /** Write to stderr (diagnostics, human guidance, errors) — never mixed into piped stdout. */
  writeErr(text: string): void;
  /** The environment used for config overrides + the secrets provider (default `process.env`). */
  readonly env: Env;
  /** The working directory commands resolve relative paths (config file, data dir, sources) against. */
  readonly cwd: string;
}

/** The real, process-backed {@link Io}. */
export function processIo(): Io {
  return {
    write: (text) => void process.stdout.write(text),
    writeErr: (text) => void process.stderr.write(text),
    env: process.env,
    cwd: process.cwd(),
  };
}

/** Write a single line (appending `\n`) to stdout. */
export function line(io: Io, text = ''): void {
  io.write(`${text}\n`);
}

/** Write a single line (appending `\n`) to stderr. */
export function errline(io: Io, text = ''): void {
  io.writeErr(`${text}\n`);
}
