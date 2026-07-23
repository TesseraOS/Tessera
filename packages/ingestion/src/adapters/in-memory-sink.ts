import {
  DEFAULT_PROJECT_ID,
  DEFAULT_TENANT_ID,
  type ProjectId,
  type TenantId,
} from '@tessera/core';
import type { DocumentId, ProcessedDocument } from '../domain.js';
import { documentIdFor } from '../domain.js';
import type { DocumentRef, DocumentSink } from '../ports/sink.js';

/** In-memory {@link DocumentSink} that also exposes its contents for assertions and inspection. */
export interface InMemoryDocumentSink extends DocumentSink {
  /** All documents stored in THIS view's `(tenant, project)` partition. */
  all(): readonly ProcessedDocument[];
  /** Look up a stored document by id within this view's partition. */
  get(id: DocumentId): ProcessedDocument | undefined;
  /** Number of documents in this view's partition. */
  readonly size: number;
  forTenant(tenantId: TenantId): InMemoryDocumentSink;
  forProject(projectId: ProjectId): InMemoryDocumentSink;
}

/**
 * In-memory {@link DocumentSink} — the local default and the seam downstream features replace with
 * relational/vector/blob/graph-backed sinks (F-007/F-008/F-009). Idempotent: upserting the same
 * document id overwrites in place.
 *
 * **Scope-partitioned (F-071).** Every view writes into its own `(tenant, project)` partition, and
 * `all()`/`get()`/`size` read the current view's partition — so a scan under `(A, P1)` leaves the
 * `(B, …)` and `(A, P2)` partitions empty, which is exactly the isolation the sink promises. The base
 * sink's view is `(default, default)`, so every pre-scope caller and test observes the same storage
 * it always did.
 */
export function createInMemoryDocumentSink(): InMemoryDocumentSink {
  const partitions = new Map<string, Map<DocumentId, ProcessedDocument>>();
  const scopeKey = (tenantId: TenantId, projectId: ProjectId): string =>
    JSON.stringify([tenantId, projectId]);

  function viewFor(tenantId: TenantId, projectId: ProjectId): InMemoryDocumentSink {
    const key = scopeKey(tenantId, projectId);
    const partition = (): Map<DocumentId, ProcessedDocument> => {
      let documents = partitions.get(key);
      if (documents === undefined) {
        documents = new Map();
        partitions.set(key, documents);
      }
      return documents;
    };

    return {
      upsert(document) {
        partition().set(document.id, document);
        return Promise.resolve();
      },
      remove(ref: DocumentRef) {
        partition().delete(documentIdFor(ref.sourceId, ref.path));
        return Promise.resolve();
      },
      all() {
        return [...partition().values()];
      },
      get(id) {
        return partition().get(id);
      },
      get size() {
        return partition().size;
      },
      // forTenant resets the project to the tenant's default (ADR-0033), mirroring every other store.
      forTenant(nextTenant) {
        return viewFor(nextTenant, DEFAULT_PROJECT_ID);
      },
      forProject(nextProject) {
        return viewFor(tenantId, nextProject);
      },
    };
  }

  return viewFor(DEFAULT_TENANT_ID, DEFAULT_PROJECT_ID);
}
