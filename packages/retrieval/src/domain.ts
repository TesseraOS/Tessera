/** The retrieval signals fused into one ranked set. Temporal (FR-24) is added in R1 (F-018). */
export const RETRIEVER_KINDS = ['semantic', 'keyword', 'graph', 'symbolic'] as const;
export type RetrieverKind = (typeof RETRIEVER_KINDS)[number];

/** Default number of results a retriever/fusion returns when no limit is given. */
export const DEFAULT_RETRIEVAL_LIMIT = 10;

/** A retrieval request. `text` is the natural-language or symbol query. */
export interface RetrievalQuery {
  readonly text: string;
  /** Maximum candidates to return (default {@link DEFAULT_RETRIEVAL_LIMIT}). */
  readonly limit?: number;
}

/**
 * A single retriever's hit. `ref` identifies the retrieved item within a shared corpus space (a
 * document/chunk/node id) so fusion can combine signals for the same item. Retrievers return
 * candidates **ordered best-first**; `score` is a retriever-local relevance (higher = better) kept
 * for attribution/debugging — fusion uses rank, not the raw score.
 */
export interface Candidate {
  readonly ref: string;
  readonly signal: RetrieverKind;
  readonly score: number;
  /** Optional human-readable label/snippet for the item. */
  readonly label?: string;
}

/** How one signal contributed to a fused candidate (per-candidate attribution — FR-26). */
export interface SignalContribution {
  readonly signal: RetrieverKind;
  /** 1-based rank of the item within that retriever's results. */
  readonly rank: number;
  readonly score: number;
  readonly weight: number;
  /** The reciprocal-rank-fusion contribution this signal added to the fused score. */
  readonly contribution: number;
}

/** One item in the fused, ranked result set, with the signals that produced it. */
export interface FusedCandidate {
  readonly ref: string;
  /** Total fused score (sum of signal contributions). */
  readonly score: number;
  readonly signals: readonly SignalContribution[];
  readonly label?: string;
}
