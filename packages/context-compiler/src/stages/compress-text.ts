import { estimateTokens } from '../tokens.js';

/** A compressed excerpt of a fragment: query-relevant text that fits a token target. */
export interface CompressionResult {
  readonly text: string;
  readonly tokens: number;
}

/** An ordered unit of a fragment's text, with its token cost and query relevance. */
interface Segment {
  readonly index: number;
  readonly text: string;
  readonly relevance: number;
}

/** Lowercase alphanumeric terms (≥ 2 chars) used for query/segment overlap scoring. */
function terms(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((term) => term.length >= 2);
}

/**
 * Split text into ordered segments — lines, then sentences within a line (a conservative
 * `.`/`!`/`?`-followed-by-space split that leaves code lines intact). Blank segments are dropped. Each
 * segment is scored by how many distinct query terms it contains.
 */
function segmentize(text: string, queryTerms: ReadonlySet<string>): Segment[] {
  const segments: Segment[] = [];
  for (const line of text.split(/\r?\n/)) {
    for (const part of line.split(/(?<=[.!?])\s+/)) {
      const trimmed = part.trim();
      if (trimmed.length === 0) continue;
      let relevance = 0;
      for (const term of new Set(terms(trimmed))) {
        if (queryTerms.has(term)) relevance += 1;
      }
      segments.push({ index: segments.length, text: trimmed, relevance });
    }
  }
  return segments;
}

/** Join segments back in original order. */
function join(segments: readonly Segment[]): string {
  return [...segments]
    .sort((a, b) => a.index - b.index)
    .map((segment) => segment.text)
    .join('\n');
}

/**
 * Citation-preserving **extractive** compression (FR-31): keep the query-most-relevant segments of
 * `text` that fit `targetTokens`, restored to their original order. Deterministic — segments are chosen
 * by relevance (ties broken by original position) and the token budget is enforced on the joined result,
 * so the output **never exceeds** `targetTokens`. Returns `undefined` if not even one segment fits (the
 * caller then drops the fragment). The excerpt is a faithful subset of the source, so it stays
 * attributable to the same `ref`/provenance (the citation is preserved). No LLM — abstractive/pluggable
 * compression is F-020.
 */
export function compressToFit(
  text: string,
  query: string,
  targetTokens: number,
): CompressionResult | undefined {
  if (targetTokens <= 0) return undefined;
  const queryTerms = new Set(terms(query));
  const segments = segmentize(text, queryTerms);
  if (segments.length === 0) return undefined;

  // Consider segments most-relevant-first (then earliest); keep each that still fits the whole excerpt.
  const bySelection = [...segments].sort((a, b) =>
    b.relevance !== a.relevance ? b.relevance - a.relevance : a.index - b.index,
  );
  const chosen: Segment[] = [];
  for (const segment of bySelection) {
    if (estimateTokens(join([...chosen, segment])) <= targetTokens) {
      chosen.push(segment);
    }
  }
  if (chosen.length === 0) return undefined;

  const excerpt = join(chosen);
  return { text: excerpt, tokens: estimateTokens(excerpt) };
}
