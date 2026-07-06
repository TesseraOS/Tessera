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

// --- memory (/v1/memory*) — mirrors @tessera/memory MEMORY_KINDS + the memory schemas (F-007) ---
export type MemoryKind =
  'decision' | 'lesson' | 'incident' | 'failure' | 'architecture' | 'glossary' | 'task';

/** The ordered kinds, for filter dropdowns + labels (mirrors MEMORY_KINDS). */
export const MEMORY_KINDS: readonly MemoryKind[] = [
  'decision',
  'lesson',
  'incident',
  'failure',
  'architecture',
  'glossary',
  'task',
];

/** Provenance/linkage on a memory (FR-11). */
export interface MemoryMetadata {
  source?: string;
  author?: string;
  links?: string[];
  tags?: string[];
}

export interface CaptureMemoryBody {
  kind: MemoryKind;
  title: string;
  body: string;
  scope?: string;
  confidence?: number;
  metadata?: MemoryMetadata;
}

/** `PATCH /v1/memory/:lineageId` — at least one field must change (appends a superseding version). */
export interface EditMemoryBody {
  title?: string;
  body?: string;
  scope?: string;
  confidence?: number;
  metadata?: MemoryMetadata;
}

/** One immutable memory version (FR-12). `supersededBy === null` marks the current head. */
export interface Memory {
  id: string;
  lineageId: string;
  kind: MemoryKind;
  title: string;
  body: string;
  scope: string;
  confidence: number;
  metadata: MemoryMetadata;
  version: number;
  supersedes: string | null;
  supersededBy: string | null;
  createdAt: string;
}

export interface MemoryListFilter {
  kind?: MemoryKind;
  scope?: string;
}

export interface MemoryListResponse {
  memories: Memory[];
}

/** `GET /v1/memory/:lineageId/history` — every version, oldest first. */
export interface MemoryHistoryResponse {
  versions: Memory[];
}

// --- audit (GET /v1/audit) — mirrors the @tessera/api audit schemas (F-027) ---
export type AuditAction =
  | 'search'
  | 'compile'
  | 'effects.read'
  | 'memory.read'
  | 'memory.write'
  | 'billing.read'
  | 'billing.manage'
  | 'audit.read';

export type AuditOutcome = 'success' | 'denied';

export interface AuditActor {
  principalId: string;
  kind: 'local' | 'user' | 'token';
}

export interface AuditEvent {
  id: string;
  tenantId: string;
  actor: AuditActor;
  action: AuditAction;
  target?: string;
  outcome: AuditOutcome;
  at: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface AuditQuery {
  action?: AuditAction;
  actor?: string;
  outcome?: AuditOutcome;
  since?: string;
  until?: string;
  limit?: number;
  cursor?: string;
}

export interface AuditPage {
  events: AuditEvent[];
  nextCursor?: string;
}

// --- sources (/v1/sources*) — mirrors the @tessera/api sources schemas (F-038/FR-62) ---

/**
 * Connector kinds. The Local runtime scans `filesystem` + `git` (both keyed on a working-tree
 * `root`); `github` is present for labeling only — it is not yet wired into the runtime source
 * service, so the UI offers it as an explicitly unavailable option (never a form that 400s).
 */
export type SourceKind = 'filesystem' | 'git' | 'github';

/** The connector kinds a user can actually register + scan in this deployment. */
export const REGISTERABLE_SOURCE_KINDS = [
  'filesystem',
  'git',
] as const satisfies readonly SourceKind[];

export interface Source {
  id: string;
  kind: string;
  label: string;
  config: Record<string, unknown>;
  createdAt: string;
}

export interface RegisterSourceBody {
  kind: SourceKind;
  label?: string;
  config: { root: string };
}

export interface SourceListResponse {
  sources: Source[];
}

/** Counts of what a scan changed (incremental + idempotent). */
export interface ScanSummary {
  added: number;
  modified: number;
  removed: number;
  unchanged: number;
}

export interface ScanResult {
  source: Source;
  summary: ScanSummary;
}

export type ScanState = 'idle' | 'running' | 'error';

export interface ScanStatus {
  state: ScanState;
  lastScan?: { summary: ScanSummary; at: string };
  error?: string;
}

// --- billing plans (GET /v1/billing/plans) — mirrors the @tessera/api billing schemas (F-030) ---
export interface Entitlements {
  maxMonthlyCompiles: number;
  maxSeats: number;
  maxTokensPerCompile: number;
}

export interface Plan {
  id: string;
  name: string;
  priceCents: number;
  interval: 'month' | 'year' | null;
  entitlements: Entitlements;
}

export interface PlansResponse {
  plans: Plan[];
}

// --- ops (unversioned GET /health + GET /ready) — mirrors apps/api/src/routes/health.ts ---
export interface HealthStatus {
  status: 'ok';
}

export interface ReadyCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface ReadyStatus {
  status: 'ready' | 'not_ready';
  checks: ReadyCheck[];
}

// --- knowledge graph (/v1/graph, /v1/effects) — mirrors @tessera/knowledge-graph (F-008/F-040/F-043) ---

export type NodeKind = 'file' | 'symbol' | 'module' | 'person' | 'decision' | 'memory';
export const NODE_KINDS: readonly NodeKind[] = [
  'file',
  'symbol',
  'module',
  'person',
  'decision',
  'memory',
];

export type EdgeKind =
  | 'imports'
  | 'calls'
  | 'references'
  | 'contains'
  | 'owns'
  | 'defines'
  | 'supersedes'
  | 'EFFECT_LINK';

export interface GraphNode {
  id: string;
  kind: NodeKind;
  key: string;
  label: string;
  metadata: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  rationale: string | null;
  confidence: number | null;
  origin: string | null;
  metadata: Record<string, unknown>;
}

export interface GraphSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphQuery {
  limit?: number;
  nodeKinds?: NodeKind[];
  edgeKinds?: EdgeKind[];
}

/** A node affected by a change, with the path that reaches it and a score (get_effects, FR-19). */
export interface EffectHit {
  nodeId: string;
  node: GraphNode;
  path: string[];
  distance: number;
  score: number;
}

export interface EffectsResponse {
  effects: EffectHit[];
}

export interface EffectsQuery {
  kind: NodeKind;
  key: string;
  maxDepth?: number;
}
