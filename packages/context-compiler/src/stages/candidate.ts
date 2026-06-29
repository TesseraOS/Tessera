import type { RetrieverKind } from '@tessera/retrieval';

/** A candidate flowing through the pipeline before it is resolved to fragment content. */
export interface WorkingCandidate {
  readonly ref: string;
  readonly score: number;
  /** Distinct retrieval signals that surfaced this ref. */
  readonly signals: readonly RetrieverKind[];
  /** Set when the candidate was pulled in by graph expansion. */
  readonly expandedFrom?: string;
}
