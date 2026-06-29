import type { WorkingCandidate } from './candidate.js';

/** Score bonus per *extra* matching signal (a candidate hit by several retrievers ranks higher). */
const MULTI_SIGNAL_BONUS = 0.1;

export interface RankOptions {
  readonly multiSignalBonus?: number;
}

/**
 * Rank stage (ARCHITECTURE §9): score candidates by retrieval relevance, boosted when several
 * signals agree, and order them. (Recency/authority/task-fit factors slot in here as the graph
 * gains timestamps/ownership.) Deterministic: ties broken by ref.
 */
export function rankCandidates(
  candidates: readonly WorkingCandidate[],
  options: RankOptions = {},
): WorkingCandidate[] {
  const bonus = options.multiSignalBonus ?? MULTI_SIGNAL_BONUS;
  return candidates
    .map((candidate) => ({
      ...candidate,
      score: candidate.score * (1 + bonus * Math.max(0, candidate.signals.length - 1)),
    }))
    .sort((a, b) =>
      b.score !== a.score ? b.score - a.score : a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0,
    );
}
