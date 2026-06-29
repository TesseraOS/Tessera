const TERM_PATTERN = /[\p{L}\p{N}_]+/gu;

/**
 * Extract lowercased identifier-like terms from query text (letters/digits/underscore runs),
 * de-duplicated and order-preserving. Shared by the keyword (FTS), graph, and symbolic retrievers
 * so they tokenize a query the same way.
 */
export function extractTerms(text: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const match of text.matchAll(TERM_PATTERN)) {
    const term = match[0].toLowerCase();
    if (!seen.has(term)) {
      seen.add(term);
      terms.push(term);
    }
  }
  return terms;
}
