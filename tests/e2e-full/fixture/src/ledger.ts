/**
 * Fixture module (F-048). The distinctive term here is "quernstone" — a nonsense word chosen so a
 * search assertion can only match THIS fixture, never incidental content from elsewhere in the repo.
 */

export interface QuernstoneEntry {
  readonly id: string;
  readonly amount: number;
}

/** Append an entry to the quernstone ledger and return the running total. */
export function appendQuernstoneEntry(
  ledger: readonly QuernstoneEntry[],
  entry: QuernstoneEntry,
): readonly QuernstoneEntry[] {
  return [...ledger, entry];
}

/** Sum every amount in the quernstone ledger. */
export function totalQuernstone(ledger: readonly QuernstoneEntry[]): number {
  return ledger.reduce((sum, entry) => sum + entry.amount, 0);
}
