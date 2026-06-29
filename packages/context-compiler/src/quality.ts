import type { HybridRetriever } from '@tessera/retrieval';
import type { CompileRequest, ContextFragment, ContextPackage } from './domain.js';
import type { FragmentSource } from './ports/fragment-source.js';
import { computePackageScores } from './scores.js';
import { estimateTokens } from './tokens.js';

/** Labels for evaluating a package: the set of refs that are genuinely relevant to the task. */
export interface QualityLabels {
  readonly relevant: ReadonlySet<string>;
}

/** A package's Context Quality Score and its components (PRD §9 north star). */
export interface ContextQualityScore {
  /** F1 of included fragments against the relevant set. */
  readonly relevance: number;
  readonly redundancy: number;
  readonly budgetAdherence: number;
  readonly provenanceCoverage: number;
  /** Weighted overall score in `[0,1]`. */
  readonly overall: number;
}

const QUALITY_WEIGHTS = {
  relevance: 0.5,
  redundancy: 0.2,
  budgetAdherence: 0.15,
  provenance: 0.15,
} as const;

/**
 * Score a compiled package against relevance labels: relevance (F1 of included vs relevant), plus
 * the package's redundancy, budget adherence, and provenance coverage, combined into one Context
 * Quality Score. Used to show the compiler beats naive top-k RAG (FR-27 acceptance).
 */
export function computeContextQuality(
  pkg: ContextPackage,
  labels: QualityLabels,
): ContextQualityScore {
  const fragments = pkg.sections.flatMap((section) => section.fragments);
  const includedRelevant = fragments.filter((fragment) => labels.relevant.has(fragment.ref)).length;
  const precision = fragments.length === 0 ? 0 : includedRelevant / fragments.length;
  const recall = labels.relevant.size === 0 ? 1 : includedRelevant / labels.relevant.size;
  const relevance = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  const { redundancy, budgetAdherence, provenanceCoverage } = pkg.scores;
  const overall =
    QUALITY_WEIGHTS.relevance * relevance +
    QUALITY_WEIGHTS.redundancy * (1 - redundancy) +
    QUALITY_WEIGHTS.budgetAdherence * budgetAdherence +
    QUALITY_WEIGHTS.provenance * provenanceCoverage;

  return { relevance, redundancy, budgetAdherence, provenanceCoverage, overall };
}

/**
 * The naive top-k RAG baseline: take the retriever's top-`k` nearest, with **no** dedup, graph
 * expansion, budget enforcement, or provenance — "embed everything, grab the top-k, paste it in"
 * (PRD §2). Produced as a {@link ContextPackage} so it can be scored by {@link computeContextQuality}.
 */
export async function naiveTopKPackage(
  retriever: HybridRetriever,
  request: CompileRequest,
  fragmentSource: FragmentSource,
  k: number,
): Promise<ContextPackage> {
  const candidates = await retriever.search({ text: request.task, limit: k });
  const fetched = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      fragment: await fragmentSource.get(candidate.ref),
    })),
  );

  const fragments: ContextFragment[] = [];
  let totalTokens = 0;
  for (const { candidate, fragment } of fetched) {
    if (fragment === undefined) continue;
    const tokens = estimateTokens(fragment.text);
    totalTokens += tokens; // naive RAG does not enforce a budget
    fragments.push({
      ref: fragment.ref,
      text: fragment.text,
      kind: fragment.kind,
      tokens,
      score: candidate.score,
      provenance: { retrievalScore: candidate.score, signals: [] }, // naive keeps no provenance
      whyIncluded: 'top-k nearest',
    });
  }

  return {
    task: request.task,
    budget: request.budget,
    sections: [{ title: 'Context', fragments }],
    totalTokens,
    trace: {
      stages: [
        {
          stage: 'naive-top-k',
          inputCount: candidates.length,
          outputCount: fragments.length,
          dropped: [],
        },
      ],
    },
    scores: computePackageScores(fragments, request.budget, totalTokens),
  };
}
