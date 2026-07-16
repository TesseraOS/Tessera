/** The retrieval signals fused into one ranked set (semantic/keyword/graph/symbolic + temporal, FR-24). */
export const RETRIEVER_KINDS = ['semantic', 'keyword', 'graph', 'symbolic', 'temporal'] as const;
export type RetrieverKind = (typeof RETRIEVER_KINDS)[number];

/** Default number of results a retriever/fusion returns when no limit is given. */
export const DEFAULT_RETRIEVAL_LIMIT = 10;

/** A retrieval request. `text` is the natural-language or symbol query. */
export interface RetrievalQuery {
  readonly text: string;
  /** Maximum candidates to return (default {@link DEFAULT_RETRIEVAL_LIMIT}). */
  readonly limit?: number;
  /** Extras to attach to each hit, each of which costs tokens (F-061). See {@link RetrievalInclude}. */
  readonly include?: RetrievalInclude;
}

/**
 * Opt-in per-hit extras.
 *
 * **Why these are opt-in and `label` is not.** A ranked answer is something every caller pays for on
 * every call, and NFR-4 holds it to a measured token budget. The line is drawn at *what makes a hit
 * an answer*: without a label a hit is a 64-char hash — unreadable to a person and useless to an
 * agent, which is not an answer at any price, so the label is always on. Everything here is **depth**
 * — worth real tokens to a dashboard rendering a detail view, worth nothing to an agent that only
 * wants ranked refs to compile. Measured on a 10-result answer: `kind` +35, `node` +135, `snippet`
 * ~+200. `node` is the dearest because it restates the label's path with the extension stripped.
 *
 * These control what is **attached**, not what is looked up: the corpus fragment is fetched anyway
 * to supply the label, so asking for more costs wire tokens, never extra work.
 */
export interface RetrievalInclude {
  /** Classify each hit as `file` | `memory` | `symbol`. */
  readonly kind?: boolean;
  /** Attach the graph node (`GET /v1/effects` is keyed by it), when the hit has one. */
  readonly node?: boolean;
  /** Attach a query-relevant excerpt. */
  readonly snippet?: SnippetRequest;
}

/** How much excerpt to return per hit. */
export interface SnippetRequest {
  /** Hard ceiling on the excerpt's characters (the extractor never exceeds it). */
  readonly maxChars?: number;
}

/**
 * {@link RetrievalInclude} as a validator infers it — every optional widened with `| undefined`.
 * Zod's `.optional()` produces this shape, while the domain type above is exact-optional under
 * `exactOptionalPropertyTypes`; the two notions of "optional" differ and meet at
 * {@link toRetrievalInclude}.
 */
export interface LooseRetrievalInclude {
  readonly kind?: boolean | undefined;
  readonly node?: boolean | undefined;
  readonly snippet?: { readonly maxChars?: number | undefined } | undefined;
}

/**
 * Bridge a validated request's `include` onto the exact-optional domain type, dropping keys that
 * are absent rather than setting them to `undefined`.
 *
 * Lives here, in the package that owns {@link RetrievalInclude}, so the REST route and the MCP tool
 * share one mapper: two hand-rolled copies of the same bridge are exactly how the surfaces drift
 * apart on which flags they honour (ADR-0036 parity is structural or it is nothing).
 */
export function toRetrievalInclude(include: LooseRetrievalInclude): RetrievalInclude {
  const snippet =
    include.snippet === undefined
      ? undefined
      : include.snippet.maxChars === undefined
        ? {}
        : { maxChars: include.snippet.maxChars };

  return {
    ...(include.kind === undefined ? {} : { kind: include.kind }),
    ...(include.node === undefined ? {} : { node: include.node }),
    ...(snippet === undefined ? {} : { snippet }),
  };
}

/**
 * A query-relevant excerpt of an item's text, with the matched spans located rather than marked up.
 *
 * **Offsets, never HTML.** `matches` index into `text`, so a client slices the plain string and
 * renders its own highlight elements. This text is ingested repository content — attacker-
 * influenceable — so shipping pre-marked HTML would make the classic search-snippet XSS available
 * to anyone who can get a file into a scanned repo. With offsets there is no markup to inject and
 * no sanitizer to get wrong: the injection is structurally impossible, not merely filtered.
 */
export interface Snippet {
  readonly text: string;
  /** Spans of `text` that matched a query term, ascending, non-overlapping. */
  readonly matches: readonly SnippetMatch[];
  /** `text` starts mid-document (render a leading ellipsis). */
  readonly truncatedStart: boolean;
  /** `text` stops before the document's end (render a trailing ellipsis). */
  readonly truncatedEnd: boolean;
}

/** A matched span, as `[start, end)` character offsets into {@link Snippet.text}. */
export interface SnippetMatch {
  readonly start: number;
  readonly end: number;
}

/** The knowledge-graph node an item corresponds to, when it has one (F-061 "show effects"). */
export interface CandidateNode {
  readonly kind: string;
  readonly key: string;
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
  /**
   * What kind of thing this is — `file` | `memory` | `symbol` (F-061). Derived by the enrichment
   * decorator from the corpus fragment, not stored: the retrievers deal in opaque refs.
   */
  readonly kind?: string;
  /** A query-relevant excerpt, present only when {@link RetrievalQuery.snippet} asked for one. */
  readonly snippet?: Snippet;
  /**
   * The graph node this item is, when it has one. `GET /v1/effects` is keyed by `{kind, key}` — not
   * by ref — so this is what makes "what breaks if I change this?" reachable from a search hit.
   * Absent for items with no node (a memory), and consumers must then omit the action rather than
   * offer one that cannot work.
   */
  readonly node?: CandidateNode;
}
