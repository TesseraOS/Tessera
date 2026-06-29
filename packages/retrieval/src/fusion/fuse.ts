import {
  DEFAULT_RETRIEVAL_LIMIT,
  type Candidate,
  type FusedCandidate,
  type RetrieverKind,
  type SignalContribution,
} from '../domain.js';

/** Reciprocal-rank-fusion constant; dampens the weight of lower ranks (standard default 60). */
export const DEFAULT_RRF_K = 60;

/** One retriever's ordered candidates, tagged with its signal. */
export interface RetrieverResult {
  readonly signal: RetrieverKind;
  readonly candidates: readonly Candidate[];
}

export interface FusionOptions {
  /** Per-signal weights (default 1 each). A weight of 0 drops that signal from the fusion. */
  readonly weights?: Partial<Record<RetrieverKind, number>>;
  /** RRF constant (default {@link DEFAULT_RRF_K}). */
  readonly k?: number;
  /** Maximum fused results to return (default {@link DEFAULT_RETRIEVAL_LIMIT}). */
  readonly limit?: number;
}

interface Accumulator {
  ref: string;
  label: string | undefined;
  score: number;
  signals: SignalContribution[];
}

function toFused(accumulator: Accumulator): FusedCandidate {
  const base = { ref: accumulator.ref, score: accumulator.score, signals: accumulator.signals };
  return accumulator.label === undefined ? base : { ...base, label: accumulator.label };
}

/**
 * Combine several retrievers' results into one ranked set by **weighted Reciprocal Rank Fusion**
 * (FR-26). Each candidate at 1-based rank `r` for signal `s` adds `weight[s] * 1/(k + r)` to its
 * ref's fused score. Rank-based, so heterogeneous retriever scores need no normalization. Every
 * fused candidate records each contributing signal (per-candidate attribution). Sorted by fused
 * score desc, ties broken by ref; truncated to `limit`.
 */
export function fuse(
  results: readonly RetrieverResult[],
  options: FusionOptions = {},
): FusedCandidate[] {
  const k = options.k ?? DEFAULT_RRF_K;
  const limit = options.limit ?? DEFAULT_RETRIEVAL_LIMIT;
  const byRef = new Map<string, Accumulator>();

  for (const result of results) {
    const weight = options.weights?.[result.signal] ?? 1;
    if (weight === 0) continue;
    result.candidates.forEach((candidate, index) => {
      const rank = index + 1;
      const contribution = weight * (1 / (k + rank));
      let accumulator = byRef.get(candidate.ref);
      if (accumulator === undefined) {
        accumulator = { ref: candidate.ref, label: candidate.label, score: 0, signals: [] };
        byRef.set(candidate.ref, accumulator);
      } else if (accumulator.label === undefined && candidate.label !== undefined) {
        accumulator.label = candidate.label;
      }
      accumulator.score += contribution;
      accumulator.signals.push({
        signal: result.signal,
        rank,
        score: candidate.score,
        weight,
        contribution,
      });
    });
  }

  return [...byRef.values()]
    .map(toFused)
    .sort((a, b) =>
      b.score !== a.score ? b.score - a.score : a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0,
    )
    .slice(0, limit);
}
