import type { ProcessedDocument } from '../domain.js';
import { adrMemoryExtractor } from './adr-extractor.js';
import type { CandidateMemory, MemoryExtractor } from './candidate.js';
import { githubMemoryExtractor } from './github-extractor.js';

/** The first-party extractors: ADRs → decisions, settled GitHub items → decisions/lessons (FR-14). */
export const defaultMemoryExtractors: readonly MemoryExtractor[] = [
  adrMemoryExtractor,
  githubMemoryExtractor,
];

/**
 * Run every extractor over one document and collect the candidates, de-duplicating by `source` so a
 * single document never proposes the same memory twice within one pass.
 */
export function runExtractors(
  extractors: readonly MemoryExtractor[],
  document: ProcessedDocument,
): readonly CandidateMemory[] {
  const bySource = new Map<string, CandidateMemory>();
  const anonymous: CandidateMemory[] = [];
  for (const extractor of extractors) {
    for (const candidate of extractor(document)) {
      const source = candidate.metadata?.source;
      if (source === undefined) {
        anonymous.push(candidate);
      } else if (!bySource.has(source)) {
        bySource.set(source, candidate);
      }
    }
  }
  return [...bySource.values(), ...anonymous];
}
