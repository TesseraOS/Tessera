import type { ProcessedDocument } from '../domain.js';

/**
 * A processing stage — the plugin contract for transforming a document on its way to persistence
 * (FR-7). First-party processors (normalize, redact) implement it; chunking, symbol/memory
 * extraction, and embedding arrive as further processors behind this same contract.
 *
 * Processors must be **pure with respect to their input** (return a new document; never mutate the
 * argument) and **idempotent** — a job may be retried.
 */
export interface Processor {
  readonly name: string;
  process(document: ProcessedDocument): Promise<ProcessedDocument> | ProcessedDocument;
}

/** Run processors in order, threading each output into the next. */
export async function runPipeline(
  processors: readonly Processor[],
  document: ProcessedDocument,
): Promise<ProcessedDocument> {
  let current = document;
  for (const processor of processors) {
    current = await processor.process(current);
  }
  return current;
}
