import type { ProcessedDocument } from '../domain.js';

/**
 * Memory kinds automatic extraction can produce. Mirrors `MEMORY_KINDS` in `@tessera/memory`
 * **deliberately**: the extraction seam is *structural* (see {@link import('../adapters/memory-extraction-sink.js')})
 * so `@tessera/ingestion` takes no dependency on the memory package and no cycle forms (ADR-0024).
 */
export type CandidateMemoryKind =
  'decision' | 'lesson' | 'incident' | 'failure' | 'architecture' | 'glossary' | 'task';

/** Provenance for a candidate memory (mirrors `MemoryMetadata`; `source` is the idempotency key). */
export interface CandidateMemoryMetadata {
  /** Stable origin id used to dedupe on re-ingest, e.g. `adr:0015` or `github:owner/repo#123`. */
  readonly source?: string;
  readonly author?: string;
  readonly links?: readonly string[];
  readonly tags?: readonly string[];
}

/**
 * A memory an extractor proposes from an ingested document (FR-14). Shaped to match the
 * `@tessera/memory` capture input so a {@link import('../adapters/memory-extraction-sink.js').MemoryCaptureService}
 * can persist it unchanged.
 */
export interface CandidateMemory {
  readonly kind: CandidateMemoryKind;
  readonly title: string;
  readonly body: string;
  readonly scope?: string;
  readonly confidence?: number;
  readonly metadata?: CandidateMemoryMetadata;
}

/**
 * Turns a processed (normalized + **redacted**) document into zero or more candidate memories.
 * Extractors are pure and deterministic — no network, no LLM (FR-14 heuristic extraction; richer
 * extraction is a later increment). They see redacted text, so extracted memories never carry secrets.
 */
export type MemoryExtractor = (document: ProcessedDocument) => readonly CandidateMemory[];
