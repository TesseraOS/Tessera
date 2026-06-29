import type { ContextPackage } from '@tessera/context-compiler';

/** Per-fragment explanation: why it was selected and the signals behind it (FR-28/32). */
export interface FragmentExplanation {
  readonly ref: string;
  readonly kind: string;
  readonly whyIncluded: string;
  readonly signals: readonly string[];
  readonly retrievalScore: number;
  readonly expandedFrom?: string;
}

/** One compilation stage as the inspector sees it (FR-44). */
export interface StageExplanation {
  readonly stage: string;
  readonly in: number;
  readonly out: number;
  readonly dropped: readonly { ref: string; reason: string }[];
}

/** The `explain` tool's projection of a compiled package — provenance + trace, no fragment bodies. */
export interface Explanation {
  readonly task: string;
  readonly budget: number;
  readonly totalTokens: number;
  readonly scores: ContextPackage['scores'];
  readonly fragments: readonly FragmentExplanation[];
  readonly trace: readonly StageExplanation[];
}

/**
 * Project a {@link ContextPackage} into an {@link Explanation}: the "why included" + provenance for
 * each kept fragment and the per-stage trace, without the fragment text. Pure (unit-tested).
 */
export function buildExplanation(pkg: ContextPackage): Explanation {
  const fragments = pkg.sections.flatMap((section) =>
    section.fragments.map((fragment): FragmentExplanation => {
      const { signals, retrievalScore, expandedFrom } = fragment.provenance;
      return {
        ref: fragment.ref,
        kind: fragment.kind,
        whyIncluded: fragment.whyIncluded,
        signals,
        retrievalScore,
        ...(expandedFrom !== undefined ? { expandedFrom } : {}),
      };
    }),
  );

  const trace = pkg.trace.stages.map((stage): StageExplanation => ({
    stage: stage.stage,
    in: stage.inputCount,
    out: stage.outputCount,
    dropped: stage.dropped.map((drop) => ({ ref: drop.ref, reason: drop.reason })),
  }));

  return {
    task: pkg.task,
    budget: pkg.budget,
    totalTokens: pkg.totalTokens,
    scores: pkg.scores,
    fragments,
    trace,
  };
}
