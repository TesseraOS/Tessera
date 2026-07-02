import type { WorkingCandidate } from './stages/candidate.js';
import { compressToFit, type CompressionResult } from './stages/compress-text.js';
import { rankCandidates, type RankOptions } from './stages/rank.js';

/**
 * A pluggable **compression** strategy (FR-34): given a fragment's text, a query, and a token target,
 * return a citation-preserving excerpt that fits (or `undefined` if it cannot). The default is the
 * deterministic extractive compressor; an LLM/abstractive strategy can replace it **without any API
 * change** (it is injected into the compiler). `id` participates in the reproducibility key (FR-33).
 */
export interface CompressionStrategy {
  readonly id: string;
  compress(text: string, query: string, targetTokens: number): CompressionResult | undefined;
}

/** The default, dependency-free extractive compressor (F-019). */
export const extractiveCompression: CompressionStrategy = {
  id: 'extractive',
  compress: compressToFit,
};

/**
 * A pluggable **ranking** strategy (FR-34): order the candidates best-first. The default boosts
 * multi-signal agreement (the F-010 ranker); a custom ranker can replace it without an API change. `id`
 * participates in the reproducibility key (FR-33).
 */
export interface RankStrategy {
  readonly id: string;
  rank(candidates: readonly WorkingCandidate[]): WorkingCandidate[];
}

/** The default relevance ranker (multi-signal-boosted), wrapping {@link rankCandidates}. */
export function defaultRankStrategy(options: RankOptions = {}): RankStrategy {
  return {
    id: 'relevance',
    rank: (candidates) => rankCandidates(candidates, options),
  };
}
