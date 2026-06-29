import type { TraceDrop } from '../domain.js';
import { estimateTokens } from '../tokens.js';
import type { ResolvedCandidate } from './resolve.js';

/** A fragment selected to fit the budget, with its token cost. */
export interface BudgetedItem {
  readonly item: ResolvedCandidate;
  readonly tokens: number;
}

export interface CompressResult {
  readonly selected: BudgetedItem[];
  readonly dropped: TraceDrop[];
  readonly totalTokens: number;
}

/**
 * Compress stage (FR-29): include fragments in rank order while the running token total stays within
 * `budget`; anything that would overflow is dropped (and traced). Degrades gracefully — an oversized
 * top fragment is skipped so smaller, still-relevant ones can fit. The package **never exceeds the
 * budget**. (Citation-preserving summarization is FR-31 / R1.)
 */
export function fitToBudget(items: readonly ResolvedCandidate[], budget: number): CompressResult {
  const selected: BudgetedItem[] = [];
  const dropped: TraceDrop[] = [];
  let totalTokens = 0;

  for (const item of items) {
    const tokens = estimateTokens(item.fragment.text);
    if (totalTokens + tokens <= budget) {
      selected.push({ item, tokens });
      totalTokens += tokens;
    } else {
      dropped.push({
        ref: item.candidate.ref,
        reason: `exceeds budget (needs ${tokens} tokens, ${budget - totalTokens} remaining)`,
      });
    }
  }

  return { selected, dropped, totalTokens };
}
