import { documentIdFor, type DocumentSink } from '@tessera/ingestion';
import type { BlobStore } from '@tessera/storage';
import { putFragment } from '../fragment-source.js';

/**
 * A {@link DocumentSink} that lands processed documents in the **compiler corpus** (F-038): each
 * document's normalized, secret-scrubbed text is written as a blob fragment under its deterministic id
 * (the same `{ kind, text, metadata }` convention {@link createBlobFragmentSource} reads). Binary
 * documents carry no text and are skipped. This is the persistence half of the runtime ingestion sink;
 * making these documents **retrievable** (keyword/semantic/temporal indices) is F-039, which extends
 * this sink. `remove` deletes the fragment (idempotent — no error if absent).
 */
export function createBlobFragmentSink(blob: BlobStore): DocumentSink {
  return {
    async upsert(document) {
      if (document.kind === 'binary') return;
      await putFragment(blob, {
        ref: document.id,
        kind: document.kind,
        text: document.text,
        metadata: { ...document.metadata, sourceId: document.source.id, path: document.path },
      });
    },
    async remove(ref) {
      await blob.delete(documentIdFor(ref.sourceId, ref.path));
    },
  };
}
