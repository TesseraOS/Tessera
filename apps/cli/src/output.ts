import { line, type Io } from './io.js';

/** Print a value as pretty JSON to stdout — the `--json` machine-readable path (ADR-0036). */
export function printJson(io: Io, value: unknown): void {
  line(io, JSON.stringify(value, null, 2));
}

/** One aligned row of a two-column table. */
export interface TableRow {
  readonly label: string;
  readonly value: string;
}

/**
 * Render left-aligned `label   value` rows (used by `doctor` and `mcp-config`). Pure string builder so
 * it is trivially testable and never touches a stream itself.
 */
export function renderTable(rows: readonly TableRow[]): string {
  const width = rows.reduce((max, row) => Math.max(max, row.label.length), 0);
  return rows.map((row) => `${row.label.padEnd(width)}  ${row.value}`).join('\n');
}
