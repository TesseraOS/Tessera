import type { DocumentSink } from '../ports/sink.js';
import type {
  CandidateMemory,
  CandidateMemoryKind,
  MemoryExtractor,
} from '../extraction/candidate.js';
import { runExtractors } from '../extraction/extract.js';

/** The minimal view of a persisted memory the extraction sink reads back (for idempotency). */
export interface CapturedMemory {
  readonly lineageId: string;
  readonly body: string;
  readonly metadata: { readonly source?: string };
}

/**
 * The narrow slice of `@tessera/memory`'s `MemoryService` the extraction sink needs. Declared here
 * **structurally** so `@tessera/ingestion` takes no dependency on `@tessera/memory` and no package
 * cycle forms — the real service is assignable to it, and tests pass a fake (ADR-0024). The service
 * enforces the versioning invariant (FR-12): `edit` appends a superseding version, never mutating.
 */
export interface MemoryCaptureService {
  capture(input: CandidateMemory): Promise<CapturedMemory>;
  edit(lineageId: string, patch: { readonly body: string }): Promise<CapturedMemory>;
  list(filter?: { readonly kind?: CandidateMemoryKind }): Promise<readonly CapturedMemory[]>;
}

export interface MemoryExtractionSinkOptions {
  /** Where captured memories are persisted (the real `MemoryService` in production; a fake in tests). */
  readonly memory: MemoryCaptureService;
  /** Extractors to run over each document (default: {@link import('../extraction/extract.js').defaultMemoryExtractors}). */
  readonly extractors: readonly MemoryExtractor[];
}

/** Find the current auto-extracted memory for a `source` within its kind, if one exists. */
async function findBySource(
  memory: MemoryCaptureService,
  kind: CandidateMemoryKind,
  source: string,
): Promise<CapturedMemory | undefined> {
  const existing = await memory.list({ kind });
  return existing.find((item) => item.metadata.source === source);
}

/** Capture a candidate, or supersede/skip an existing one with the same `source` (idempotent). */
async function captureIdempotently(
  memory: MemoryCaptureService,
  candidate: CandidateMemory,
): Promise<void> {
  const source = candidate.metadata?.source;
  if (source === undefined) {
    // No stable id to dedupe on — capture unconditionally (extractors always set one today).
    await memory.capture(candidate);
    return;
  }
  const existing = await findBySource(memory, candidate.kind, source);
  if (existing === undefined) {
    await memory.capture(candidate);
    return;
  }
  // Same origin: append a new version only when the content changed; otherwise no-op (idempotent).
  if (existing.body !== candidate.body) {
    await memory.edit(existing.lineageId, { body: candidate.body });
  }
}

/**
 * A {@link DocumentSink} that turns ingested documents into **captured memories** (FR-14). On each
 * `upsert` it runs the extractors and, for every candidate, captures a new memory or supersedes the
 * existing one with the same `source` — so re-ingesting a document never duplicates a memory. It does
 * **not** persist the documents themselves; compose it with a persistence sink via
 * {@link import('./tee-sink.js').teeSink}. `remove` is a no-op: memories are versioned, never
 * hard-deleted (the F-007 invariant).
 */
export function createMemoryExtractionSink(options: MemoryExtractionSinkOptions): DocumentSink {
  const { memory, extractors } = options;
  return {
    async upsert(document) {
      for (const candidate of runExtractors(extractors, document)) {
        await captureIdempotently(memory, candidate);
      }
    },
    remove() {
      return Promise.resolve();
    },
  };
}
