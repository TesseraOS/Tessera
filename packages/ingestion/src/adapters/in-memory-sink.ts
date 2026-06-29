import type { DocumentId, ProcessedDocument } from '../domain.js';
import { documentIdFor } from '../domain.js';
import type { DocumentRef, DocumentSink } from '../ports/sink.js';

/** In-memory {@link DocumentSink} that also exposes its contents for assertions and inspection. */
export interface InMemoryDocumentSink extends DocumentSink {
  /** All currently stored documents. */
  all(): readonly ProcessedDocument[];
  /** Look up a stored document by id. */
  get(id: DocumentId): ProcessedDocument | undefined;
  /** Number of stored documents. */
  readonly size: number;
}

/**
 * In-memory {@link DocumentSink} — the local default and the seam downstream features replace with
 * relational/vector/blob/graph-backed sinks (F-007/F-008/F-009). Idempotent: upserting the same
 * document id overwrites in place.
 */
export function createInMemoryDocumentSink(): InMemoryDocumentSink {
  const documents = new Map<DocumentId, ProcessedDocument>();

  return {
    upsert(document) {
      documents.set(document.id, document);
      return Promise.resolve();
    },
    remove(ref: DocumentRef) {
      documents.delete(documentIdFor(ref.sourceId, ref.path));
      return Promise.resolve();
    },
    all() {
      return [...documents.values()];
    },
    get(id) {
      return documents.get(id);
    },
    get size() {
      return documents.size;
    },
  };
}
