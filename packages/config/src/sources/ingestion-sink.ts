import {
  DEFAULT_PROJECT_ID,
  DEFAULT_TENANT_ID,
  type ProjectId,
  type TenantId,
} from '@tessera/core';
import { documentIdFor, type DocumentSink, type ProcessedDocument } from '@tessera/ingestion';
import type { CorpusIndexer, IndexTimestamp } from './corpus-indexer.js';

/** Prefer a document's git commit time, then its filesystem mtime, else let the indexer use `now`. */
function documentTimestamp(document: ProcessedDocument): IndexTimestamp | undefined {
  const metadata = document.metadata as Record<string, unknown>;
  const git = metadata['git'] as { readonly committedAt?: unknown } | undefined;
  if (typeof git?.committedAt === 'string' && git.committedAt.length > 0) return git.committedAt;
  const modifiedAt = metadata['modifiedAt'];
  if (typeof modifiedAt === 'string' && modifiedAt.length > 0) return modifiedAt;
  return undefined;
}

/**
 * The runtime ingestion {@link DocumentSink} (F-039): every processed document is written to the blob
 * corpus **and indexed** (keyword/temporal/semantic) through the {@link CorpusIndexer}, so `search` and
 * `compile` answer from the user's real repository. Binary documents carry no text and are skipped;
 * removal drops the document from the corpus + every index.
 *
 * **Scope-aware (F-071, ADR-0057).** The worker resolves `sink.forTenant(t).forProject(p)` from the
 * queue job and this sink threads that scope into `CorpusIndexer.indexDocument`, so the content lands
 * in the tenant/project that registered the source instead of `DEFAULT_TENANT_ID`. The base view is
 * `(default, default)` — the local single-tenant shape — so nothing pre-scope changes. Mirrors
 * `createIndexingMemoryService`, its sibling in this directory.
 */
export function createIndexingDocumentSink(
  indexer: CorpusIndexer,
  tenantId: TenantId = DEFAULT_TENANT_ID,
  projectId: ProjectId = DEFAULT_PROJECT_ID,
): DocumentSink {
  return {
    async upsert(document) {
      if (document.kind === 'binary') return;
      const timestamp = documentTimestamp(document);
      await indexer.indexDocument({
        ref: document.id,
        text: document.text,
        kind: document.kind,
        metadata: { ...document.metadata, sourceId: document.source.id, path: document.path },
        tenantId,
        projectId,
        ...(timestamp !== undefined ? { timestamp } : {}),
      });
    },
    async remove(ref) {
      await indexer.removeDocument({
        ref: documentIdFor(ref.sourceId, ref.path),
        tenantId,
        projectId,
      });
    },
    // forTenant resets the project to the tenant's default (ADR-0033), mirroring every other store.
    forTenant(nextTenant) {
      return createIndexingDocumentSink(indexer, nextTenant, DEFAULT_PROJECT_ID);
    },
    forProject(nextProject) {
      return createIndexingDocumentSink(indexer, tenantId, nextProject);
    },
  };
}
