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

/** The plan cap that reduced this compile's budget — present ONLY when a clamp actually applied. */
export interface BudgetClamp {
  readonly requested: number;
  readonly effective: number;
}

/** The `explain` tool's projection of a compiled package — provenance + trace, no fragment bodies. */
export interface Explanation {
  readonly task: string;
  readonly budget: number;
  readonly totalTokens: number;
  readonly scores: ContextPackage['scores'];
  readonly fragments: readonly FragmentExplanation[];
  readonly trace: readonly StageExplanation[];
  /**
   * Stated here and nowhere else (F-077, ADR-0056). `compile_context` clamps SILENTLY, matching
   * REST — the clamp is already derivable there, because `pkg.budget` is the effective budget and
   * the caller holds what it asked for. `explain` is the deliberately verbose diagnostic path, so
   * it names the cap outright rather than making an agent diff its own request. Omitted entirely
   * when no clamp applied, so the common case costs nothing (NFR-4).
   */
  readonly budgetClamp?: BudgetClamp;
}

/**
 * Project a {@link ContextPackage} into an {@link Explanation}: the "why included" + provenance for
 * each kept fragment and the per-stage trace, without the fragment text. Pure (unit-tested).
 */
export function buildExplanation(
  pkg: ContextPackage,
  options: { readonly requestedBudget?: number } = {},
): Explanation {
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

  // `pkg.budget` IS the effective budget (the compiler echoes what it was given, and the caller
  // clamps before calling it), so a reduction is exactly `requested > pkg.budget`.
  const { requestedBudget } = options;
  const clamped = requestedBudget !== undefined && requestedBudget > pkg.budget;

  return {
    task: pkg.task,
    budget: pkg.budget,
    totalTokens: pkg.totalTokens,
    scores: pkg.scores,
    fragments,
    trace,
    ...(clamped ? { budgetClamp: { requested: requestedBudget, effective: pkg.budget } } : {}),
  };
}
