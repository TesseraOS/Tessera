import type { FragmentSource, SourceFragment } from '@tessera/context-compiler';
import type { BlobStore } from '@tessera/storage';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** On-disk shape of a corpus document (one blob per `ref`). */
interface StoredDocument {
  readonly kind: string;
  readonly text: string;
  readonly metadata?: Record<string, unknown>;
}

/** Encode a corpus document for blob storage (used by ingestion/tests to populate the corpus). */
export function encodeDocument(doc: StoredDocument): Uint8Array {
  return encoder.encode(JSON.stringify(doc));
}

/** Store one corpus fragment under its `ref` in the blob store. */
export async function putFragment(blob: BlobStore, fragment: SourceFragment): Promise<void> {
  const doc: StoredDocument =
    fragment.metadata === undefined
      ? { kind: fragment.kind, text: fragment.text }
      : { kind: fragment.kind, text: fragment.text, metadata: { ...fragment.metadata } };
  await blob.put(fragment.ref, encodeDocument(doc));
}

/**
 * Compiler {@link FragmentSource} backed by the filesystem {@link BlobStore}: a document `ref` maps
 * to a blob holding JSON `{ kind, text, metadata? }`. Wires the compiler's corpus seam to local
 * storage; ingestion's persistent DocumentSink writes these blobs (downstream). A missing or
 * malformed blob resolves to `undefined` (the compiler drops and traces it).
 */
export function createBlobFragmentSource(blob: BlobStore): FragmentSource {
  return {
    async get(ref) {
      const bytes = await blob.get(ref);
      if (bytes === undefined) return undefined;

      let parsed: unknown;
      try {
        parsed = JSON.parse(decoder.decode(bytes));
      } catch {
        return undefined;
      }
      if (typeof parsed !== 'object' || parsed === null) return undefined;

      const doc = parsed as Partial<StoredDocument>;
      if (typeof doc.text !== 'string' || typeof doc.kind !== 'string') return undefined;

      const fragment: SourceFragment =
        doc.metadata !== undefined && typeof doc.metadata === 'object'
          ? { ref, text: doc.text, kind: doc.kind, metadata: doc.metadata }
          : { ref, text: doc.text, kind: doc.kind };
      return fragment;
    },
  };
}
