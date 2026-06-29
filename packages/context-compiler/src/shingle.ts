/** Default word-shingle size for near-duplicate detection. */
export const DEFAULT_SHINGLE_SIZE = 3;

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];
}

/**
 * Word k-shingles of `text` (overlapping windows of `size` words). Shorter texts yield a single
 * whole-text shingle so they still compare. Used for embedding-free near-duplicate detection.
 */
export function shingles(text: string, size: number = DEFAULT_SHINGLE_SIZE): Set<string> {
  const tokens = words(text);
  if (tokens.length === 0) return new Set();
  if (tokens.length <= size) return new Set([tokens.join(' ')]);
  const set = new Set<string>();
  for (let i = 0; i + size <= tokens.length; i += 1) {
    set.add(tokens.slice(i, i + size).join(' '));
  }
  return set;
}

/** Jaccard similarity of two shingle sets in `[0,1]` (1 = identical, 0 = disjoint). */
export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const shingle of a) {
    if (b.has(shingle)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}
