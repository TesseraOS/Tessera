import { extractTerms, type Snippet, type SnippetMatch } from '@tessera/retrieval';

/**
 * Query-relevant excerpts for search hits (F-061).
 *
 * **Why not reuse the compiler's `compressToFit` (F-019).** That solves a different problem: it picks
 * the most relevant segments from *anywhere* in a document and rejoins them in original order to fill
 * a token budget. That is right for a compile package and wrong for a search excerpt — the output is
 * non-contiguous fragments spliced together, which reads as a jumble when a person expects a window
 * around the match. It also returns no offsets, so it cannot drive a highlight. Reusing it would also
 * invert the layering (the compiler depends on retrieval, not the reverse) and freeze a
 * compile-tuning knob into the search contract.
 *
 * **What is reused is the tokenizer.** {@link extractTerms} is the same function the keyword, graph
 * and symbolic retrievers tokenize with, so a highlight marks exactly what the retriever matched. A
 * local re-implementation would drift and start highlighting things that did not contribute to the
 * hit — a provenance lie, which is the one thing this product cannot afford.
 */

/** Default excerpt ceiling — roughly two lines of prose; the caller may lower or raise it. */
export const DEFAULT_SNIPPET_MAX_CHARS = 240;

/** Floor, so a pathological `maxChars: 1` still produces something legible. */
const MIN_SNIPPET_MAX_CHARS = 40;

/** Characters of lead-in kept before the first match, so a hit is never flush against the edge. */
const CONTEXT_BEFORE = 32;

const TERM_PATTERN = /[\p{L}\p{N}_]+/gu;

interface Token {
  readonly term: string;
  readonly start: number;
  readonly end: number;
}

/**
 * Collapse whitespace runs to single spaces. Source files are full of indentation and blank lines;
 * a one-line excerpt of them is unreadable otherwise. Offsets are computed against the collapsed
 * text and only ever reported against it, so nothing can index the wrong string.
 */
function normalize(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(TERM_PATTERN)) {
    const start = match.index;
    if (start === undefined) continue;
    tokens.push({ term: match[0].toLowerCase(), start, end: start + match[0].length });
  }
  return tokens;
}

/** Walk back to a word boundary so a window never opens mid-word. */
function snapStart(text: string, at: number): number {
  if (at <= 0) return 0;
  let index = at;
  while (index > 0 && !/\s/u.test(text[index - 1] ?? '')) index -= 1;
  return index;
}

/** Walk back to a word boundary so a window never closes mid-word (unless that would empty it). */
function snapEnd(text: string, at: number, floor: number): number {
  if (at >= text.length) return text.length;
  let index = at;
  while (index > floor && !/\s/u.test(text[index] ?? '')) index -= 1;
  return index > floor ? index : at;
}

/**
 * Extract a contiguous, query-relevant window of `text` with the matched spans located.
 *
 * Picks the window containing the **most** query-term matches (earliest wins a tie, so the result is
 * deterministic — a search excerpt that shuffles between identical requests is a bug you cannot
 * reproduce). Returns `undefined` only for empty text.
 *
 * When nothing matches, returns a **leading window with no matches** rather than nothing: a
 * semantic-only hit legitimately has no lexical match, and the excerpt is still worth showing — but
 * it must not fake a highlight it does not have.
 *
 * Never exceeds `maxChars`.
 */
export function extractSnippet(
  text: string,
  query: string,
  options: { maxChars?: number } = {},
): Snippet | undefined {
  const maxChars = Math.max(MIN_SNIPPET_MAX_CHARS, options.maxChars ?? DEFAULT_SNIPPET_MAX_CHARS);
  const body = normalize(text);
  if (body.length === 0) return undefined;

  const terms = new Set(extractTerms(query));
  const tokens = tokenize(body);
  const hits = terms.size === 0 ? [] : tokens.filter((token) => terms.has(token.term));

  const windowStart = hits.length === 0 ? 0 : chooseWindowStart(body, hits, maxChars);
  const rawEnd = Math.min(body.length, windowStart + maxChars);
  const windowEnd = snapEnd(body, rawEnd, windowStart);

  const excerpt = body.slice(windowStart, windowEnd);
  const matches: SnippetMatch[] = hits
    .filter((hit) => hit.start >= windowStart && hit.end <= windowEnd)
    .map((hit) => ({ start: hit.start - windowStart, end: hit.end - windowStart }));

  return {
    text: excerpt,
    matches,
    truncatedStart: windowStart > 0,
    truncatedEnd: windowEnd < body.length,
  };
}

/** The window start that captures the most matches, biased to keep a little lead-in context. */
function chooseWindowStart(body: string, hits: readonly Token[], maxChars: number): number {
  let bestStart = 0;
  let bestCount = -1;

  for (const anchor of hits) {
    const start = snapStart(body, Math.max(0, anchor.start - CONTEXT_BEFORE));
    const end = start + maxChars;
    let count = 0;
    for (const hit of hits) {
      if (hit.start >= start && hit.end <= end) count += 1;
    }
    // Strictly greater: the earliest window wins a tie, keeping the choice deterministic.
    if (count > bestCount) {
      bestCount = count;
      bestStart = start;
    }
  }

  return bestStart;
}
