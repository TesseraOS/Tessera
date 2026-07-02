import type {
  CompilationTrace,
  CompileRequest,
  ContextFragment,
  ContextPackage,
  ContextSection,
  FragmentProvenance,
} from '../domain.js';
import { computePackageScores } from '../scores.js';
import type { WorkingCandidate } from './candidate.js';
import type { BudgetedItem } from './compress.js';

function buildProvenance(
  candidate: WorkingCandidate,
  source?: Readonly<Record<string, unknown>>,
): FragmentProvenance {
  return {
    retrievalScore: candidate.score,
    signals: candidate.signals,
    ...(candidate.expandedFrom !== undefined ? { expandedFrom: candidate.expandedFrom } : {}),
    ...(source !== undefined ? { source } : {}),
  };
}

function buildWhyIncluded(candidate: WorkingCandidate): string {
  const score = candidate.score.toFixed(3);
  if (candidate.expandedFrom !== undefined) {
    return `pulled in as an effect-dependent of ${candidate.expandedFrom} (score ${score})`;
  }
  const signals = candidate.signals.length > 0 ? candidate.signals.join('+') : 'retrieval';
  return `retrieved by ${signals} (score ${score})`;
}

function toFragment(budgeted: BudgetedItem): ContextFragment {
  const { candidate, fragment } = budgeted.item;
  // A compressed fragment carries its excerpt (still attributable to the same ref/provenance — the
  // citation is preserved) and notes the compression in its "why included" (FR-31).
  const text = budgeted.compressed?.text ?? fragment.text;
  const whyIncluded =
    budgeted.compressed !== undefined
      ? `${buildWhyIncluded(candidate)}; compressed to fit budget (${budgeted.compressed.originalTokens}→${budgeted.tokens} tokens)`
      : buildWhyIncluded(candidate);
  return {
    ref: fragment.ref,
    text,
    kind: fragment.kind,
    tokens: budgeted.tokens,
    score: candidate.score,
    provenance: buildProvenance(candidate, fragment.metadata),
    whyIncluded,
  };
}

function sectionsByKind(fragments: readonly ContextFragment[]): ContextSection[] {
  const byKind = new Map<string, ContextFragment[]>();
  for (const fragment of fragments) {
    const group = byKind.get(fragment.kind);
    if (group === undefined) byKind.set(fragment.kind, [fragment]);
    else group.push(fragment);
  }
  const maxScore = (group: readonly ContextFragment[]): number =>
    group.reduce((best, f) => Math.max(best, f.score), 0);
  return [...byKind.entries()]
    .map(([title, group]): ContextSection => ({ title, fragments: group }))
    .sort((a, b) =>
      maxScore(b.fragments) !== maxScore(a.fragments)
        ? maxScore(b.fragments) - maxScore(a.fragments)
        : a.title < b.title
          ? -1
          : a.title > b.title
            ? 1
            : 0,
    );
}

/**
 * Assemble stage (FR-28/32): turn the budget-selected items into a sectioned, provenance-tagged
 * Context Package — each fragment carries its provenance and a "why included" explanation — with the
 * running token total, package scores, and the full compilation trace attached.
 */
export function assemble(
  request: CompileRequest,
  selected: readonly BudgetedItem[],
  totalTokens: number,
  trace: CompilationTrace,
): ContextPackage {
  const fragments = selected.map(toFragment);
  return {
    task: request.task,
    budget: request.budget,
    sections: sectionsByKind(fragments),
    totalTokens,
    trace,
    scores: computePackageScores(fragments, request.budget, totalTokens),
  };
}
