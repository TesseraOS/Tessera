/** Average characters per token — a deterministic heuristic basis for budgeting (a real tokenizer is a later refinement). */
const CHARS_PER_TOKEN = 4;

/** Estimate the token cost of text. Deterministic and platform-independent (used for budget bounding). */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
