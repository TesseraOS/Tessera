import type { TraceDrop } from '../domain.js';
import { jaccard, shingles } from '../shingle.js';
import type { ResolvedCandidate } from './resolve.js';

/** Shingle-Jaccard similarity at/above which two fragments are treated as near-duplicates. */
export const DEFAULT_DEDUP_THRESHOLD = 0.8;

export interface DedupResult {
  readonly kept: ResolvedCandidate[];
  readonly dropped: TraceDrop[];
}

/**
 * Dedup stage (FR-30): collapse near-identical fragments using word-shingle Jaccard (no embeddings).
 * Inputs are in rank order, so the **highest-ranked** member of each duplicate cluster is kept and
 * the rest are dropped (and traced with which ref they duplicated).
 */
export function dedupeFragments(
  items: readonly ResolvedCandidate[],
  threshold: number = DEFAULT_DEDUP_THRESHOLD,
): DedupResult {
  const kept: ResolvedCandidate[] = [];
  const keptShingles: { ref: string; set: Set<string> }[] = [];
  const dropped: TraceDrop[] = [];

  for (const item of items) {
    const set = shingles(item.fragment.text);
    const duplicate = keptShingles.find((entry) => jaccard(entry.set, set) >= threshold);
    if (duplicate === undefined) {
      kept.push(item);
      keptShingles.push({ ref: item.candidate.ref, set });
    } else {
      dropped.push({ ref: item.candidate.ref, reason: `near-duplicate of ${duplicate.ref}` });
    }
  }

  return { kept, dropped };
}
