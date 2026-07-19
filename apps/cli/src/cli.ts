import { TesseraError } from '@tessera/core';
import type { Command } from './command.js';
import { isCliError } from './errors.js';
import { runHelp } from './help.js';
import { errline, line, type Io } from './io.js';
import { CLI_VERSION } from './version.js';
import { doctorCommand } from './commands/doctor.js';
import { initCommand } from './commands/init.js';
import { mcpCommand } from './commands/mcp.js';
import { mcpConfigCommand } from './commands/mcp-config.js';
import { serveCommand } from './commands/serve.js';
import { sourceCommand } from './commands/source.js';
import { tokenCommand } from './commands/token.js';

/**
 * The registered commands, in help-listing order. The router dispatches on the first token; each
 * command parses the remaining tokens itself. Adding a command is adding a row here — help stays in
 * sync because it renders from this same list.
 */
export const COMMANDS: readonly Command[] = [
  initCommand,
  serveCommand,
  mcpCommand,
  sourceCommand,
  tokenCommand,
  doctorCommand,
  mcpConfigCommand,
];

/** Print `error: …` (+ hint) to stderr and map the throw to an exit code — the single error funnel. */
function reportError(io: Io, error: unknown): number {
  if (isCliError(error)) {
    errline(io, `error: ${error.message}`);
    if (error.hint !== undefined) errline(io, `hint: ${error.hint}`);
    return error.exitCode;
  }
  if (error instanceof TesseraError) {
    errline(io, `error: ${error.code}: ${error.message}`);
    return 1;
  }
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  errline(io, `unexpected error: ${message}`);
  return 1;
}

/**
 * Run the CLI: dispatch `argv` (the tokens after `tessera`) to a command and resolve with the exit
 * code. `bin/tessera.ts` passes `process.argv.slice(2)` + a process-backed {@link Io}; tests pass their
 * own. Never throws — every failure becomes an exit code via {@link reportError}.
 */
export async function run(argv: readonly string[], io: Io): Promise<number> {
  const first = argv[0];

  if (first === undefined || first === 'help' || first === '--help' || first === '-h') {
    return runHelp(io, COMMANDS);
  }
  if (first === 'version' || first === '--version' || first === '-v') {
    line(io, CLI_VERSION);
    return 0;
  }

  const command = COMMANDS.find((candidate) => candidate.name === first);
  if (command === undefined) {
    errline(io, `error: unknown command '${first}'`);
    errline(io, "run 'tessera --help' to see the available commands.");
    return 1;
  }

  const rest = argv.slice(1);
  if (rest.includes('--help') || rest.includes('-h')) {
    line(io, command.usage);
    return 0;
  }

  try {
    return await command.run(io, rest);
  } catch (error) {
    return reportError(io, error);
  }
}
