import type { RetrieverKind } from '@tessera/retrieval';

/** Optional filters narrowing what may enter the package. */
export interface ContextFilters {
  /** Restrict fragments to these kinds (e.g. `'code'`, `'memory'`). */
  readonly kinds?: readonly string[];
}

/** A request to compile context for a task (FR-27). */
export interface CompileRequest {
  readonly task: string;
  /** Maximum tokens the package may occupy. */
  readonly budget: number;
  /** Per-need retrieval cap (default applied by the compiler). */
  readonly retrievalLimit?: number;
  readonly filters?: ContextFilters;
}

/** A planned information need with its share of the budget. */
export interface Need {
  readonly text: string;
  readonly budget: number;
}

/** Why a fragment is in the package — the signals/scores behind it (FR-28/32). */
export interface FragmentProvenance {
  /** Fused retrieval score that first surfaced this ref. */
  readonly retrievalScore: number;
  /** Distinct retrieval signals that matched it. */
  readonly signals: readonly RetrieverKind[];
  /** If pulled in by graph expansion, the ref it was expanded from. */
  readonly expandedFrom?: string;
  /** Non-sensitive metadata from the fragment source. */
  readonly source?: Readonly<Record<string, unknown>>;
}

/** One provenance-tagged fragment in the package. */
export interface ContextFragment {
  readonly ref: string;
  readonly text: string;
  readonly kind: string;
  readonly tokens: number;
  /** Final rank score. */
  readonly score: number;
  readonly provenance: FragmentProvenance;
  /** Human-readable "why included" (FR-32). */
  readonly whyIncluded: string;
}

/** An ordered section of fragments. */
export interface ContextSection {
  readonly title: string;
  readonly fragments: readonly ContextFragment[];
}

/** A fragment dropped at a stage, with the reason (for the trace). */
export interface TraceDrop {
  readonly ref: string;
  readonly reason: string;
}

/** One pipeline stage's record in the compilation trace. */
export interface TraceStage {
  readonly stage: string;
  readonly inputCount: number;
  readonly outputCount: number;
  readonly dropped: readonly TraceDrop[];
  readonly notes?: string;
  /** Wall-clock duration of the stage in milliseconds (observability — F-016). */
  readonly durationMs?: number;
}

/** The full compilation trace rendered by the Package Inspector (FR-44). */
export interface CompilationTrace {
  readonly stages: readonly TraceStage[];
}

/** Quality-relevant scores of a compiled package. */
export interface PackageScores {
  readonly fragmentCount: number;
  /** 1 when within budget, else the over-budget penalty in `[0,1)`. */
  readonly budgetAdherence: number;
  /** Fraction of fragments carrying retrieval provenance. */
  readonly provenanceCoverage: number;
  /** Estimated redundancy among kept fragments (0 = none). */
  readonly redundancy: number;
}

/** The compiled, provenance-tagged, budget-bounded Context Package (FR-28). */
export interface ContextPackage {
  readonly task: string;
  readonly budget: number;
  readonly sections: readonly ContextSection[];
  readonly totalTokens: number;
  readonly trace: CompilationTrace;
  readonly scores: PackageScores;
}
