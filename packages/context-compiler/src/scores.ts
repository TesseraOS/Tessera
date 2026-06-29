import type { ContextFragment, PackageScores } from './domain.js';
import { jaccard, shingles } from './shingle.js';
import { DEFAULT_DEDUP_THRESHOLD } from './stages/dedup.js';

/**
 * Compute a package's quality-relevant scores: budget adherence, provenance coverage, and residual
 * redundancy (fraction of fragment pairs that are still near-duplicates). Shared by the compiler's
 * assemble stage and the naive baseline so both are scored the same way.
 */
export function computePackageScores(
  fragments: readonly ContextFragment[],
  budget: number,
  totalTokens: number,
  threshold: number = DEFAULT_DEDUP_THRESHOLD,
): PackageScores {
  const fragmentCount = fragments.length;
  const budgetAdherence = totalTokens <= budget ? 1 : budget <= 0 ? 0 : budget / totalTokens;
  const withProvenance = fragments.filter((f) => f.provenance.signals.length > 0).length;
  const provenanceCoverage = fragmentCount === 0 ? 1 : withProvenance / fragmentCount;

  const sets = fragments.map((f) => shingles(f.text));
  let pairs = 0;
  let duplicatePairs = 0;
  for (let i = 0; i < sets.length; i += 1) {
    const a = sets[i];
    if (a === undefined) continue;
    for (let j = i + 1; j < sets.length; j += 1) {
      const b = sets[j];
      if (b === undefined) continue;
      pairs += 1;
      if (jaccard(a, b) >= threshold) duplicatePairs += 1;
    }
  }
  const redundancy = pairs === 0 ? 0 : duplicatePairs / pairs;

  return { fragmentCount, budgetAdherence, provenanceCoverage, redundancy };
}
