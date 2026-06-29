import type { ProcessedDocument, SourceId } from '../domain.js';

/** Reference to a document by its source and path (used for removal). */
export interface DocumentRef {
  readonly sourceId: SourceId;
  readonly path: string;
}

/**
 * Destination for processed documents — the seam between ingestion and persistence. Ingestion
 * ships an in-memory adapter; downstream features back this with the relational/vector/blob
 * stores and the knowledge graph (F-007/F-008/F-009). Implementations must be **idempotent**:
 * upserting the same document id twice yields one record.
 */
export interface DocumentSink {
  upsert(document: ProcessedDocument): Promise<void>;
  remove(ref: DocumentRef): Promise<void>;
}
