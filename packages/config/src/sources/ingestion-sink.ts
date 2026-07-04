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
 * removal drops the document from the corpus + every index. Ingestion runs in the default tenant
 * (F-038 boundary); memory capture indexes in its own tenant via a separate decorator.
 */
export function createIndexingDocumentSink(indexer: CorpusIndexer): DocumentSink {
  return {
    async upsert(document) {
      if (document.kind === 'binary') return;
      const timestamp = documentTimestamp(document);
      await indexer.indexDocument({
        ref: document.id,
        text: document.text,
        kind: document.kind,
        metadata: { ...document.metadata, sourceId: document.source.id, path: document.path },
        ...(timestamp !== undefined ? { timestamp } : {}),
      });
    },
    async remove(ref) {
      await indexer.removeDocument({ ref: documentIdFor(ref.sourceId, ref.path) });
    },
  };
}
