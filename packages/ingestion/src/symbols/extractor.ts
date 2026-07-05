import type { ProcessedDocument } from '../domain.js';

/** A top-level code symbol extracted from a source file (FR-16). */
export interface ExtractedSymbol {
  /** Symbol name (e.g. a function/class/interface/const name). */
  readonly name: string;
  /** Coarse category (`function`/`class`/`interface`/`const`/…) for the node label/metadata. */
  readonly kind?: string;
}

/** An import extracted from a source file (its raw specifier, resolved to a target by the sink). */
export interface ExtractedImport {
  /** The specifier exactly as written, e.g. `'./foo'` or `'react'`. */
  readonly specifier: string;
}

/** The symbols + imports extracted from one source file. */
export interface ExtractedGraph {
  readonly symbols: readonly ExtractedSymbol[];
  readonly imports: readonly ExtractedImport[];
}

/**
 * Extracts code structure (symbols + imports) from a source document (FR-16, resolves OQ5). The
 * first-party adapter is tree-sitter (WASM), TS/JS first (ADR-0041); the port keeps the parser swappable
 * (e.g. a TS-compiler-API backend later). Returns `undefined` for a language/kind it does not handle, so
 * the {@link import('../adapters/graph-extraction-sink.js').createGraphExtractionSink graph sink} skips it.
 */
export interface SymbolExtractor {
  extract(document: ProcessedDocument): Promise<ExtractedGraph | undefined>;
}

/** Graph node kinds the extraction sink writes (a subset of the knowledge-graph node kinds). */
export type GraphNodeKind = 'file' | 'symbol' | 'module';
/** Structural edge kinds the extraction sink writes (a subset of the knowledge-graph edge kinds). */
export type GraphEdgeKind = 'imports' | 'defines';

/** A node the sink upserts. */
export interface GraphNodeInput {
  readonly kind: GraphNodeKind;
  readonly key: string;
  readonly label: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** A node reference (kind + key). */
export interface GraphNodeRef {
  readonly kind: GraphNodeKind;
  readonly key: string;
}

/** A structural edge the sink upserts. */
export interface GraphEdgeInput {
  readonly from: GraphNodeRef;
  readonly to: GraphNodeRef;
  readonly kind: GraphEdgeKind;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Edge kinds the sink may remove — its own structural edges plus the derived `EFFECT_LINK`. */
export type RemovableEdgeKind = GraphEdgeKind | 'EFFECT_LINK';

/**
 * The narrow graph-write surface the extraction sink needs, declared **structurally** so
 * `@tessera/ingestion` takes no dependency on `@tessera/knowledge-graph` (no cycle) — the real
 * `KnowledgeGraphService` is assignable to it (the F-017 memory-seam pattern). Node/edge kinds are
 * literal subsets that the graph service's wider unions accept.
 */
export interface GraphWriteService {
  upsertNode(input: GraphNodeInput): Promise<unknown>;
  upsertEdge(input: GraphEdgeInput): Promise<unknown>;
  removeEdges(filter: {
    readonly from?: GraphNodeRef;
    readonly to?: GraphNodeRef;
    readonly kind?: RemovableEdgeKind;
  }): Promise<void>;
  deriveStaticEffectLinks(): Promise<number>;
}
