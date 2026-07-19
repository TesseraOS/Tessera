#!/usr/bin/env node
import { run } from '../cli.js';
import { processIo } from '../io.js';

/**
 * `tessera` — the CLI entrypoint (F-052). Thin by design: it wires the real process-backed IO into
 * {@link run} and turns the returned exit code into the process exit. All logic (parsing, dispatch,
 * error formatting) lives in `run`, which is unit-testable without spawning a process.
 */
run(process.argv.slice(2), processIo())
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    // `run` funnels all expected errors to an exit code; reaching here is a bug in the funnel itself.
    console.error('fatal:', error);
    process.exitCode = 1;
  });
