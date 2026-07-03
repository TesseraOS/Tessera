// Types mirroring the @tessera/api `/v1` Zod schemas (ADR-0022). These are intentionally a thin,
// hand-maintained mirror until the generated @tessera/sdk (F-022) replaces this module.

export type ErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export interface ErrorEnvelope {
  error: { code: ErrorCode; message: string; details?: unknown };
}

// --- search (POST /v1/search) ---
export interface SearchBody {
  query: string;
  limit?: number;
}

export interface SignalContribution {
  signal: string;
  rank: number;
  score: number;
  weight: number;
  contribution: number;
}

export interface FusedCandidate {
  ref: string;
  score: number;
  signals: SignalContribution[];
  label?: string;
}

export interface SearchResponse {
  results: FusedCandidate[];
}

// --- compile (POST /v1/compile) — the Context Package ---
export interface CompileBody {
  task: string;
  budget: number;
  retrievalLimit?: number;
  filters?: { kinds?: string[] };
}

export interface FragmentProvenance {
  retrievalScore: number;
  signals: string[];
  expandedFrom?: string;
  source?: Record<string, unknown>;
}

export interface ContextFragment {
  ref: string;
  text: string;
  kind: string;
  tokens: number;
  score: number;
  provenance: FragmentProvenance;
  whyIncluded: string;
}

export interface ContextSection {
  title: string;
  fragments: ContextFragment[];
}

export interface TraceDrop {
  ref: string;
  reason: string;
}

export interface TraceStage {
  stage: string;
  inputCount: number;
  outputCount: number;
  dropped: TraceDrop[];
  notes?: string;
}

export interface CompilationTrace {
  stages: TraceStage[];
}

export interface PackageScores {
  fragmentCount: number;
  budgetAdherence: number;
  provenanceCoverage: number;
  redundancy: number;
}

export interface ContextPackage {
  task: string;
  budget: number;
  sections: ContextSection[];
  totalTokens: number;
  trace: CompilationTrace;
  scores: PackageScores;
}

// --- memory (POST /v1/memory) — mirrors @tessera/memory MEMORY_KINDS + the capture schema ---
export type MemoryKind =
  'decision' | 'lesson' | 'incident' | 'failure' | 'architecture' | 'glossary' | 'task';

export interface CaptureMemoryBody {
  kind: MemoryKind;
  title: string;
  body: string;
  scope?: string;
}

export interface Memory {
  id: string;
  lineageId: string;
  kind: MemoryKind;
  title: string;
  body: string;
  scope: string;
  confidence: number;
  version: number;
  createdAt: string;
}
