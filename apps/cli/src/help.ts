import type { Command } from './command.js';
import { line, type Io } from './io.js';
import { renderTable } from './output.js';
import { CLI_VERSION } from './version.js';

/** Build the top-level help text from the registered commands (kept in sync with the router by data). */
export function renderHelp(commands: readonly Command[]): string {
  const rows = commands.map((command) => ({ label: `  ${command.name}`, value: command.summary }));
  return [
    `tessera v${CLI_VERSION} — Context & Memory OS for AI coding agents`,
    '',
    'Usage: tessera <command> [options]',
    '',
    'Commands:',
    renderTable(rows),
    '',
    "Run 'tessera <command> --help' for command-specific options.",
    'Global: --version, --help. Machine-readable output: --json (where supported).',
  ].join('\n');
}

/** Print top-level help to stdout. */
export function runHelp(io: Io, commands: readonly Command[]): number {
  line(io, renderHelp(commands));
  return 0;
}
