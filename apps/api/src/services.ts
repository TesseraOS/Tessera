import type { BillingProvider } from '@tessera/billing';
import type { ContextCompiler } from '@tessera/context-compiler';
import type { SourceService } from '@tessera/ingestion';
import type { KnowledgeGraphService } from '@tessera/knowledge-graph';
import type { MemoryService } from '@tessera/memory';
import type { HybridRetriever } from '@tessera/retrieval';

/**
 * Readiness of one downstream dependency, surfaced by `/ready`. `ok: false` makes the endpoint
 * answer `503` so an orchestrator holds traffic until dependencies are reachable.
 */
export interface ReadinessCheck {
  readonly name: string;
  readonly ok: boolean;
  /** Optional non-sensitive detail (e.g. `'sqlite open'`); never include secrets. */
  readonly detail?: string;
}

/** The aggregate readiness probe `/ready` reports. */
export interface ReadinessReport {
  readonly ready: boolean;
  readonly checks: readonly ReadinessCheck[];
}

/**
 * The domain services the HTTP surface wraps — the **composition seam**. F-011 only depends on
 * these interfaces; constructing them from a deployment profile (Local: SQLite+sqlite-vec+
 * filesystem+Transformers.js, with budgets/secrets) is **F-015**. MCP (F-012) wraps the *same*
 * services — one engine, two surfaces.
 */
export interface ApiServices {
  /** Hybrid search (F-009) — `POST /v1/search`. */
  readonly search: HybridRetriever;
  /** Context compiler (F-010) — `POST /v1/compile`. */
  readonly compiler: ContextCompiler;
  /** Knowledge graph + get_effects (F-008) — `GET /v1/effects`. */
  readonly graph: KnowledgeGraphService;
  /** Versioned memory (F-007) — `/v1/memory`. */
  readonly memory: MemoryService;
  /**
   * Runtime source management (F-038; FR-62) — `/v1/sources*`. Optional; the composition root wires it
   * (register/scan repositories via the ingestion pipeline). When omitted the `/v1/sources` routes
   * return a clean "not configured" error (e.g. doc generation with no runtime).
   */
  readonly sources?: SourceService;
  /**
   * Billing provider (F-030) — `/v1/billing/*`. Optional; when omitted the routes fall back to the
   * local/free adapter (open-core default), so plans/subscription always answer.
   */
  readonly billing?: BillingProvider;
  /**
   * Optional readiness probe for `/ready`. When omitted, the server reports ready as soon as it is
   * listening. F-015/F-016 wire real dependency checks here.
   */
  readonly readiness?: () => Promise<ReadinessReport>;
}
