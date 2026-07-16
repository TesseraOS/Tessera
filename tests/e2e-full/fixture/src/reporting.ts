/**
 * Fixture module (F-048) that DEPENDS ON ledger.ts. The import chain here is what gives the graph a
 * real dependent to return: changing `ledger.ts` should surface `reporting.ts` via get_effects.
 */
import { totalQuernstone, type QuernstoneEntry } from './ledger.js';

/** Render a one-line quernstone summary for an operator report. */
export function renderQuernstoneReport(ledger: readonly QuernstoneEntry[]): string {
  return `quernstone entries: ${ledger.length}, total: ${totalQuernstone(ledger)}`;
}
