import type { DocumentRef, DocumentSink } from '../ports/sink.js';

/**
 * A {@link DocumentSink} that fans every operation out to several sinks in order — e.g. a persistence
 * sink plus the {@link import('./memory-extraction-sink.js').createMemoryExtractionSink} extraction
 * sink. Operations run sequentially so ordering (and any thrown error) is deterministic.
 */
export function teeSink(...sinks: readonly DocumentSink[]): DocumentSink {
  return {
    async upsert(document) {
      for (const sink of sinks) await sink.upsert(document);
    },
    async remove(ref: DocumentRef) {
      for (const sink of sinks) await sink.remove(ref);
    },
  };
}
