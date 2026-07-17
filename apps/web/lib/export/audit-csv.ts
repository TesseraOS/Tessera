import type { AuditEvent } from '@/lib/api/types';

/**
 * Serialize audit events for download (F-063).
 *
 * **Client-side, and that is the F-062 lesson applied rather than ignored.** The server owns the two
 * things a client cannot honestly assert — *completeness* (these are all the rows matching the
 * filters) and the *audit event* recording that an export happened. Both are facts. Turning the rows
 * it returned into CSV is a re-formatting of bytes the caller now holds: there is no truth to
 * disagree about, only style. So the server returns data and this turns it into a file.
 *
 * Pure: no DOM, no network.
 */

/** The columns, in order. Mirrors what the table shows, plus the ids a machine needs. */
const COLUMNS = [
  'at',
  'actor',
  'actorKind',
  'action',
  'target',
  'outcome',
  'tenantId',
  'id',
] as const;

/**
 * Characters that make a spreadsheet treat a cell as a formula rather than text.
 *
 * `=`, `+`, `-` and `@` are the classic four; tab and CR are included because Excel strips them and
 * then evaluates what follows.
 */
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Encode one CSV cell: RFC 4180 quoting **and** formula neutralization.
 *
 * **This is the CSV equivalent of F-062's fence injection, and it is not theoretical.** A cell
 * beginning `=` is executed by Excel and Google Sheets — `=HYPERLINK(...)` exfiltrates the row to an
 * attacker's URL on click, and older Excel would run `=cmd|...`. Audit cells are **not** trusted
 * input: `actor.principalId` comes from an OIDC or token identity, and `target` from a route URL or a
 * lineage id. An audit export handed to a compliance officer is precisely the document you least want
 * executing someone else's formula.
 *
 * Prefixing with `'` is the standard neutralization: spreadsheets render the text and evaluate
 * nothing. Structurally safe rather than hopefully safe.
 */
export function csvCell(value: unknown): string {
  const text = value === undefined || value === null ? '' : String(value);
  const neutralized = FORMULA_PREFIXES.some((prefix) => text.startsWith(prefix))
    ? `'${text}`
    : text;
  // RFC 4180: always quote, and double any embedded quote. Quoting unconditionally also handles
  // commas and newlines without a second branch to get wrong.
  return `"${neutralized.replaceAll('"', '""')}"`;
}

function row(event: AuditEvent): string {
  return [
    event.at,
    event.actor.principalId,
    event.actor.kind,
    event.action,
    event.target ?? '',
    event.outcome,
    event.tenantId,
    event.id,
  ]
    .map(csvCell)
    .join(',');
}

/** The events as RFC 4180 CSV, header included. CRLF line endings, as the RFC specifies. */
export function toCsv(events: readonly AuditEvent[]): string {
  return [COLUMNS.map(csvCell).join(','), ...events.map(row)].join('\r\n') + '\r\n';
}

/** The events as pretty JSON — the complete record, exactly as the API returned them. */
export function toJson(events: readonly AuditEvent[]): string {
  return `${JSON.stringify(events, null, 2)}\n`;
}

/** A filesystem-safe, timestamped download name. */
export function auditExportFilename(extension: string, now: Date = new Date()): string {
  const stamp = now.toISOString().slice(0, 19).replaceAll(':', '-');
  return `tessera-audit-${stamp}.${extension}`;
}
