import type { TraceDrop } from '../domain.js';
import { estimateTokens } from '../tokens.js';
import { compressToFit, type CompressionResult } from './compress-text.js';
import type { ResolvedCandidate } from './resolve.js';

/** How a fragment's text is compressed to fit a token target (the injected compression strategy, FR-34). */
export type CompressFn = (
  text: string,
  query: string,
  targetTokens: number,
) => CompressionResult | undefined;

/** Minimum remaining budget worth compressing into — avoids sub-meaningful excerpts. */
const MIN_COMPRESSED_TOKENS = 16;

/** A fragment selected to fit the budget, with its token cost (of the possibly-compressed text). */
export interface BudgetedItem {
  readonly item: ResolvedCandidate;
  readonly tokens: number;
  /** Present when the fragment was compressed to fit: the excerpt + the original (uncompressed) tokens. */
  readonly compressed?: { readonly text: string; readonly originalTokens: number };
}

export interface CompressResult {
  readonly selected: BudgetedItem[];
  readonly dropped: TraceDrop[];
  readonly totalTokens: number;
  /** How many selected fragments were compressed (for the trace note). */
  readonly compressedCount: number;
  /** Total tokens saved by compression, original − compressed (for the trace note). */
  readonly tokensSaved: number;
}

export interface CompressOptions {
  /** Query used to rank a fragment's segments when compressing (the compile task text). */
  readonly query?: string;
  /** The compression strategy (default: the extractive {@link compressToFit}). */
  readonly compress?: CompressFn;
}

/**
 * Compress stage (FR-29 + FR-31): include fragments in rank order within `budget`. A fragment that fits
 * whole is kept whole; one that overflows the **remaining** budget is **compressed** — a query-relevant
 * extractive excerpt that preserves its citation (same `ref`/provenance) — rather than dropped, unless
 * the remaining budget is below a small floor or it cannot be compressed to fit (then it is dropped and
 * traced, so a later smaller fragment can still fit — graceful degradation). The package **never exceeds
 * the budget**. Abstractive/pluggable compression is F-020.
 */
export function compressToBudget(
  items: readonly ResolvedCandidate[],
  budget: number,
  options: CompressOptions = {},
): CompressResult {
  const query = options.query ?? '';
  const compress = options.compress ?? compressToFit;
  const selected: BudgetedItem[] = [];
  const dropped: TraceDrop[] = [];
  let totalTokens = 0;
  let compressedCount = 0;
  let tokensSaved = 0;

  for (const item of items) {
    const remaining = budget - totalTokens;
    const fullTokens = estimateTokens(item.fragment.text);

    if (fullTokens <= remaining) {
      selected.push({ item, tokens: fullTokens });
      totalTokens += fullTokens;
      continue;
    }

    const compressed =
      remaining >= MIN_COMPRESSED_TOKENS
        ? compress(item.fragment.text, query, remaining)
        : undefined;
    if (compressed !== undefined) {
      selected.push({
        item,
        tokens: compressed.tokens,
        compressed: { text: compressed.text, originalTokens: fullTokens },
      });
      totalTokens += compressed.tokens;
      compressedCount += 1;
      tokensSaved += fullTokens - compressed.tokens;
    } else {
      dropped.push({
        ref: item.candidate.ref,
        reason: `exceeds budget (needs ${fullTokens} tokens, ${remaining} remaining)`,
      });
    }
  }

  return { selected, dropped, totalTokens, compressedCount, tokensSaved };
}
